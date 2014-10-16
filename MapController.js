define([
    "dojo/_base/declare",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/_base/lang",
    "dojo/request"

], function (declare, WidgetBase, TemplatedMixin, lang, request) {
    return declare([WidgetBase, TemplatedMixin], {
        templateString: '<div data-dojo-attach-point="mapNode" class="map"></div>',
        map: null,
        baseClass: "oeMap",

        postMixInProperties: function () {
            this.inherited(arguments);
        },

        buildRendering: function () {
            this.inherited(arguments);
        },

        postCreate: function () {

            var pDef = ol.proj.get('EPSG:3857');
            var pMerc = ol.proj.get('EPSG:900913');
            var pWgs84 = ol.proj.get('EPSG:4326');
            var pLam = ol.proj.get('EPSG:31370');

            var extentVlaanderen = [261640.36309339158, 6541049.685576308, 705586.6233736952, 6723275.561008167];
            var centerVlaanderen = [483613.49323354336, 6632162.6232922375];

            var view = new ol.View({
                projection: pMerc,
                maxZoom: 21,
                minZoom: 8
            });

            var map = new ol.Map({
                target: this.mapNode,
                view: view
            });

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
                    url: 'https://geo.onroerenderfgoed.be/geoserver/wms',
                    params: {
                        'LAYERS': 'vioe_geoportaal:beschermde_landschappen,vioe_geoportaal:beschermde_dorps_en_stadsgezichten,vioe_geoportaal:beschermde_archeologische_zones,vioe_geoportaal:beschermde_monumenten',
                        'TILED': true
                    }
                })),
                type: 'overlay',
                visible: true
            });

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
            map.addLayer(baseLayers);

            var layers = new ol.layer.Group({
                title: 'layers',
                layers: [
                    grbTransTileLayer,
                    grb_gbgTileLayer,
                    grb_adpTileLayer,
                    beschermdWmsLayer
                ]
            });
            map.addLayer(layers);

            orthoTileLayer.setVisible(true);

            map.addControl(new ol.control.LayerSwitcher());
            map.addControl(new ol.control.FullScreen());
            map.addControl(new ol.control.ZoomToExtent({extent: extentVlaanderen, tipLabel: 'zoom naar Vlaanderen'}));

            // Geolocation Control
            var geolocation = new ol.Geolocation({
              projection: view.getProjection()
            });
            // handle geolocation error.
            geolocation.on('error', function(error) {
                alert(error.message);
            });
            map.addControl(new ol.control.zoomtogeolocationcontrol({
                tipLabel: 'zoom naar je geolocatie',
                zoomLevel: 18,
                geolocation: geolocation
            }));

            map.on('moveend', this._onMoveEnd);


            var getfeatureinfoSource = new ol.source.TileWMS(/** @type {olx.source.TileWMSOptions} */ ({
                url: 'http://localhost:6543/mapproxy/service',
                params: {
                    'LAYERS': 'vioe_geoportaal:beschermde_landschappen,vioe_geoportaal:beschermde_dorps_en_stadsgezichten,vioe_geoportaal:beschermde_archeologische_zones,vioe_geoportaal:beschermde_monumenten',
                    'TILED': true
                },
                crossOrigin: 'anonymous'
            }));

            map.on('click', function(evt) {
                var viewResolution = /** @type {number} */ (view.getResolution());
                var url = getfeatureinfoSource.getGetFeatureInfoUrl(
                    evt.coordinate,
                    viewResolution,
                    'EPSG:3857',
                    {'INFO_FORMAT': 'text/plain'}
                );
                if (url) {
                    request(url ,{
                        headers: {
                            "X-Requested-With": null
                        }
                    }).then(
                        function(text){
                            alert(text);
                        },
                        function(error){
                            console.log("An error occurred: " + error);
                        }
                    );
                }
            });

            view.fitExtent(
                extentVlaanderen,
                /** @type {ol.Size} */ (map.getSize())
            );



            console.log("projection:");
            console.log(map.getView().getProjection());
        },

        _onMoveEnd: function (evt) {
            var map = evt.map;
            var mapview = map.getView();
            console.log("extent & center & resolution & zoom:");
            console.log(mapview.calculateExtent(map.getSize()));
            console.log(mapview.getCenter());
            console.log(mapview.getResolution());
            console.log(mapview.getZoom());
        },

        _createOsmLayer: function (title) {
            var extentVlaanderen = [261640.36309339158, 6541049.685576308, 705586.6233736952, 6723275.561008167];

            var osmSource = new ol.source.OSM({
                url: 'https://tile.geofabrik.de/dccc92ba3f2a5a2c17189755134e6b1d/{z}/{x}/{y}.png',
                maxZoom: 18
            });

            return new ol.layer.Tile({
                title: title,
                source: osmSource,
                type: 'base',
                visible: false,
                extent: extentVlaanderen
            });
        },

        _createGrbLayer: function(grbLayerId, title, isBaselayer){
            var pMerc = ol.proj.get('EPSG:900913');
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
                origin: ol.extent.getTopLeft(pMerc.getExtent()),
                resolutions: grbResolutions,
                matrixIds: grbMatrixIds
            });

            var grbProperties = {
                layer: grbLayerId,
                projection: pMerc,
                format: "image/png",
                matrixSet: 'GoogleMapsVL',
                url: "//grb.agiv.be/geodiensten/raadpleegdiensten/geocache/wmts",
                style: "default",
                version: "1.0.0",
                tileGrid: grbTileGrid
            };

            return  new ol.layer.Tile({
                title: title,
                visible: false,
                type: isBaselayer ? 'base' : 'overlay',
                source: new ol.source.WMTS(grbProperties),
                extent: extentVlaanderen
            });
        }

    });
});