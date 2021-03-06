define([
    "dojo/_base/declare",
    "mijit/_WidgetBase",
    "dojo/_base/lang",
    "dojo/request",
    "dojo/request/xhr",
    "dojo/_base/array",
    "dojo/json",
    "ol"

], function (declare, WidgetBase, lang, request, xhr, array, JSON, ol) {
    return declare([WidgetBase], {

        mapContainer: null,

        olMap: null,

        mapProjection: null,

        geoJsonLayer: null,

        oeFeaturesLayer: null,

        fullExtent: null,

        erfgoedFeatures: null,

        mapInteractions: null,

        postMixInProperties: function () {
            this.inherited(arguments);
        },

        buildRendering: function () {
            this.inherited(arguments);
        },

        postCreate: function () {
            this.inherited(arguments);

            proj4.defs("EPSG:31370","+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666666 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs"); //epsg.io

            this.pDef = ol.proj.get('EPSG:3857');
            this.pMerc = ol.proj.get('EPSG:900913');
            this.pWgs84 = ol.proj.get('EPSG:4326');
            this.pLam = ol.proj.get('EPSG:31370');
            this.mapProjection = this.pMerc;

            var extentVlaanderen = [261640.36309339158, 6541049.685576308, 705586.6233736952, 6723275.561008167];
            var centerVlaanderen = [483613.49323354336, 6632162.6232922375];
            this.fullExtent = extentVlaanderen;

            this.geoJsonFormatter =  new ol.format.GeoJSON({
                defaultDataProjection: 'EPSG:31370'
            });

            var view = new ol.View({
                projection: this.mapProjection,
                maxZoom: 21,
                minZoom: 8
            });

            var olMap = new ol.Map({
                target: this.mapContainer,
                view: view,
                controls: ol.control.defaults({
                    attribution: false,
                    rotate: false,
                    zoom: false
                }),
                logo: false
            });
            this.olMap = olMap;

            var orthoTileLayer = this._createGrbLayer("orthoklm", "Ortho", true);
            var gewestplanTileLayer = this._createGrbLayer("gewestplan", "Gewestplan", true);
            var grbTileLayer = this._createGrbLayer("grb_bsk", "GRB-Basiskaart", true);
            var grb_grTileLayer = this._createGrbLayer("grb_bsk_gr", "GRB-Basiskaart in grijswaarden", true);
            var ferrarisTileLayer = this._createGrbLayer("ferrarisx", "Ferraris", true);
            var grbTransTileLayer = this._createGrbLayer("grb_bsk_nb", "GRB-Basiskaart overlay", false);
            var grb_gbgTileLayer = this._createGrbLayer("grb_gbg", "GRB-Gebouwenlaag", false);
            var grb_adpTileLayer = this._createGrbLayer("grb_adp", "GRB-Percelenlaag", false);

            var osmTileLayer = this._createOsmLayer('Open Streetmap');

            var beschermdWmsLayer = new ol.layer.Tile({
                title: "Beschermd Onroerend Erfgoed",
                extent: extentVlaanderen,
                source: new ol.source.TileWMS(/** @type {olx.source.TileWMSOptions} */ ({
                    url: 'https://geo.onroerenderfgoed.be/geoserver/wms', //todo: move to config
                    params: {
                        'LAYERS': 'vioe_geoportaal:beschermde_landschappen,vioe_geoportaal:beschermde_dorps_en_stadsgezichten,vioe_geoportaal:beschermde_archeologische_zones,vioe_geoportaal:beschermde_monumenten',
                        'TILED': true
                    },
                    attributions: [new ol.Attribution({
                        html: '© <a href="https://www.onroerenderfgoed.be">Onroerend Erfgoed</a>'
                    })]
                })),
                type: 'overlay',
                visible: false
            });

            var geoJsonLayer = this._createGeojsonLayer('Zone', 'blue');
            this.geoJsonLayer = geoJsonLayer;
            var oeFeaturesLayer = this._createGeojsonLayer('Erfgoed Objecten', 'red');
            this.oeFeaturesLayer = oeFeaturesLayer;

            var baseLayers = new ol.layer.Group({
                title: 'Base maps',
                layers: [
                    orthoTileLayer,
                    gewestplanTileLayer,
                    grbTileLayer,
                    grb_grTileLayer,
                    osmTileLayer,
                    ferrarisTileLayer
                ]
            });
            olMap.addLayer(baseLayers);

            var layers = new ol.layer.Group({
                title: 'layers',
                layers: [
                    grbTransTileLayer,
                    grb_gbgTileLayer,
                    grb_adpTileLayer,
                    beschermdWmsLayer,
                    geoJsonLayer,
                    oeFeaturesLayer
                ]
            });
            olMap.addLayer(layers);

            osmTileLayer.setVisible(true);

            olMap.addControl(new ol.control.ScaleLine());
            olMap.addControl(new ol.control.Attribution({
                collapsible: false
            }));

            this._createInteractions();
            //olMap.on('moveend', this._onMoveEnd);

            this.zoomToExtent(extentVlaanderen);

//            console.log("projection:");
//            console.log(olMap.getView().getProjection());
        },

        startup: function () {
            this.inherited(arguments);
        },

        clearFeatures: function() {
            var oeFeaturesSource = this.oeFeaturesLayer.getSource();
            oeFeaturesSource.clear();
        },

        drawErfgoedGeom: function(geom, label) {
            var formatter =  new ol.format.GeoJSON({
                defaultDataProjection: ol.proj.get('EPSG:4326')
            });
            var oeFeaturesSource = this.oeFeaturesLayer.getSource();
            var geometry = formatter.readGeometry(geom, {
                dataProjection: ol.proj.get(geom.crs.properties.name),
                featureProjection: this.pDef
            });
            var feature = new ol.Feature({
                geometry: geometry,
                name: label
            });
            oeFeaturesSource.addFeature(feature);
        },

        drawPerceel: function(olFeature) {
            if (olFeature) {
                var perceelSource = this.geoJsonLayer.getSource();
                var geometry = olFeature.getGeometry();
                geometry.transform('EPSG:31370', 'EPSG:900913');
                var xyCoords = this._transformXyzToXy(geometry.getCoordinates());
                var xyGeom = new ol.geom.MultiPolygon(xyCoords, 'XY');
                var xyFeature = new ol.Feature({
                    geometry: xyGeom,
                    name: olFeature.get('CAPAKEY')
                });
                perceelSource.addFeature(xyFeature);
            }
            else {
                alert('Er werd geen perceel gevonden op deze locatie');
            }
        },

        _onMoveEnd: function (evt) {
            var olMap = evt.map;
            var mapview = olMap.getView();
            console.log("extent & center & resolution & zoom:");
            console.log(mapview.calculateExtent(olMap.getSize()));
            console.log(mapview.getCenter());
            console.log(mapview.getResolution());
            console.log(mapview.getZoom());
        },

        _createOsmLayer: function (title) {
            var osmSource = new ol.source.OSM({
                url: 'https://tile.geofabrik.de/dccc92ba3f2a5a2c17189755134e6b1d/{z}/{x}/{y}.png',
                maxZoom: 18,
                attributions: [
                    new ol.Attribution({
                        html: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    })
                ]
            });

            return new ol.layer.Tile({
                title: title,
                source: osmSource,
                type: 'base',
                visible: false
            });
        },

        _createGrbLayer: function(grbLayerId, title, isBaselayer){
            var proj= this.mapProjection;
            var extentVlaanderen = [261640.36309339158, 6541049.685576308, 705586.6233736952, 6723275.561008167];
            var grbResolutions = [
                156543.033928041,
                78271.5169640205,
                39135.7584820102,
                19567.8792410051,
                9783.93962050256,
                4891.96981025128,
                2445.98490512564,
                1222.99245256282,
                611.49622628141,
                305.748113140705,
                152.874056570353,
                76.4370282851763,
                38.2185141425881,
                19.1092570712941,
                9.55462853564703,
                4.77731426782352,
                2.38865713391176,
                1.19432856695588,
                0.59716428347794,
                0.29858214173897,
                0.149291070869485,
                0.0746455354347424];
            var grbMatrixIds = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

            var grbTileGrid = new ol.tilegrid.WMTS({
                origin: ol.extent.getTopLeft(proj.getExtent()),
                resolutions: grbResolutions,
                matrixIds: grbMatrixIds
            });

            var grbProperties = {
                layer: grbLayerId,
                projection: proj,
                format: "image/png",
                matrixSet: 'GoogleMapsVL',
                url: "//grb.agiv.be/geodiensten/raadpleegdiensten/geocache/wmts",
                style: "default",
                version: "1.0.0",
                tileGrid: grbTileGrid,
                attributions: [
                    new ol.Attribution({
                      html: '© <a href="http://www.agiv.be" title="AGIV" class="copyrightLink copyAgiv">AGIV</a>'
                    })
                ]

            };

            return  new ol.layer.Tile({
                title: title,
                visible: false,
                type: isBaselayer ? 'base' : 'overlay',
                source: new ol.source.WMTS(grbProperties),
                extent: extentVlaanderen
            });
        },

        _createGeojsonLayer: function(title, color) {
            var vectorSource = new ol.source.GeoJSON(
            /** @type {olx.source.GeoJSONOptions} */ ({
              object: {
                'type': 'FeatureCollection',
                'crs': {
                  'type': 'name',
                  'properties': {
                    'name': 'EPSG:900913'
                  }
                },
                'features': []
              }
            }));

            var textStyleFunction = function (feature, resolution) {
                var text = (resolution < 3 && feature.get('name') )  ? feature.get('name') : '';
                return new ol.style.Text({
                    font: '10px Verdana',
                    text: text,
                    fill: new ol.style.Fill({
                      color: color
                    }),
                    stroke: new ol.style.Stroke({
                      color: '#fff',
                      width: 3
                    })
                });
            };

            var styleFunction = function (feature, resolution) {
                var type = feature.getGeometry().getType();
                var styleText = textStyleFunction(feature, resolution);

                var style;
                if (type == 'MultiPoint' || type == 'Point') {
                    style = new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: resolution < 3 ? 10 : 5,
                            fill: new ol.style.Fill({
                                color: color
                            }),
                            stroke: new ol.style.Stroke({
                                color: color,
                                width: 1
                            })
                        }),
                        text: styleText
                    })
                }
                else {
                    style = new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: color,
                            width: 1
                        }),
                        fill: new ol.style.Fill({
                            color: color == 'red' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 0, 255, 0.3)'
                        }),
                        text: styleText
                    });
                }

                return [style];
            };

            return new ol.layer.Vector({
                title: title,
                source: vectorSource,
                style: styleFunction,
                type: 'overlay',
                visible: true
            });
        },

        getZone: function () {
            var geojsonSource = this.geoJsonLayer.getSource();

            //create empty zone multiPolygon
            var multiPolygon = new ol.geom.MultiPolygon([], 'XY');

            //add all polygons and multiPolygons from zone layer
            array.forEach(geojsonSource.getFeatures(), function (feature) {
                var cloneGeom = feature.clone().getGeometry();
                cloneGeom.transform('EPSG:900913', 'EPSG:31370');
                if (cloneGeom instanceof ol.geom.Polygon) {
                     multiPolygon.appendPolygon(cloneGeom);
                }
                else if (cloneGeom instanceof ol.geom.MultiPolygon) {
                    array.forEach(cloneGeom.getPolygons(), function (polygon) {
                        multiPolygon.appendPolygon(polygon);
                    });
                }
            });

            if (multiPolygon.getCoordinates().length > 0) {

                //transform to geojson
                var geojson = this.geoJsonFormatter.writeGeometryObject(multiPolygon, {featureProjection: 'EPSG:31370'});
                //hack to add crs. todo: remove when https://github.com/openlayers/ol3/issues/2078 is fixed
                geojson.crs = {type: "name"};
                geojson.crs.properties = {
                    "name": "urn:ogc:def:crs:EPSG::31370"
                };

                return geojson;
            }
            else {
                return null;
            }
        },

        setZone: function (geojson) {
            var geometry = this.geoJsonFormatter.readGeometry(geojson);

            var feature = new ol.Feature({
                geometry: geometry.transform('EPSG:31370', 'EPSG:900913')
            });

            var geojsonSource = this.geoJsonLayer.getSource();
            geojsonSource.addFeature(feature);
        },

        getFeatures: function () {
            return this.erfgoedFeatures;
        },

        _transformXyzToXy: function (xyzCoords) {
            var xyCoords = [];
            //make coordinates 'XY' instead of 'XYZ'. coordinates: Array.<Array.<Array.<ol.Coordinate>>>
            array.forEach(xyzCoords, function (level1) {
                var level1Array = [];
                xyCoords.push(level1Array);
                array.forEach(level1, function (level2) {
                var level2Array = [];
                level1Array.push(level2Array);
                    array.forEach(level2, function (xyzCoords) {
                        var xyArray = [ xyzCoords[0], xyzCoords[1] ];
                        level2Array.push(xyArray);
                    });
                });
            });
            return xyCoords;
        },


        transformExtent: function (extent, source, destination) {
            return ol.proj.transformExtent(extent, source, destination);
        },

        zoomToZone: function () {
            var geojsonSource = this.geoJsonLayer.getSource();
            this.zoomToExtent(geojsonSource.getExtent());
        },

        zoomToExtent: function (extent){
            this.olMap.getView().fitExtent(
                extent,
                /** @type {ol.Size} */ (this.olMap.getSize())
            );
        },

        zoomToFeatures: function () {
            var oeFeaturesSource = this.oeFeaturesLayer.getSource();
            this.zoomToExtent(oeFeaturesSource.getExtent());
        },

        startDraw: function() {
            this.stopAllDrawActions();

            var map = this.olMap;

            var drawInteraction = this.mapInteractions.draw;
            map.addInteraction(drawInteraction);

            drawInteraction.on('drawend', function (evt) {
                window.setTimeout(function() {
                  map.removeInteraction(drawInteraction);
                }, 0);
            });
        },

        stopDraw: function () {
             this.olMap.removeInteraction(this.mapInteractions.draw);
        },

        startSelect: function () {
            this.stopAllDrawActions();

            var map = this.olMap;

            var selectInteraction = new ol.interaction.Select({
                condition: ol.events.condition.click,
                layers: [this.geoJsonLayer]
            });

            this.mapInteractions.select = selectInteraction;
            map.addInteraction(selectInteraction);
        },

        removeSelectedItems: function () {
            var selectInteraction = this.mapInteractions.select;
            if (selectInteraction){
                var source = this.geoJsonLayer.getSource();
                selectInteraction.getFeatures().forEach(function (feature) {
                    source.removeFeature(feature);
                });
            }
            this.stopSelect();

        },

        stopSelect: function () {
            this.olMap.removeInteraction(this.mapInteractions.select);
        },

        startParcelSelect: function (perceelService) {
            this.stopAllDrawActions();

            var controller = this;
            var map = this.olMap;
            var eventKey = map.on('click', function (evt) {
                map.unByKey(eventKey);
                perceelService.searchPerceel(evt.coordinate).then(function (wfsresponse) {
                    var perceel = perceelService.readWfs(wfsresponse);
                    controller.drawPerceel(perceel);
                }, function (err) {
                    console.error(err);
                })
            });
            this.mapInteractions.selectParcelKey = eventKey;
        },

        stopParcelSelect: function () {
            if (this.mapInteractions.selectParcelKey) {
                this.olMap.unByKey(this.mapInteractions.selectParcelKey);
            }
        },

        stopAllDrawActions: function () {
            this.stopDraw();
            this.stopSelect();
            this.stopParcelSelect();
        },

        _createInteractions: function () {
            var drawInteraction = new ol.interaction.Draw({
                source: this.geoJsonLayer.getSource(),
                type: /** @type {ol.geom.GeometryType} */ ('Polygon')
            });

            this.mapInteractions = {
                draw: drawInteraction
            };

        }
    });
});