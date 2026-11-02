import pytest

from vap.geo.mercator import fit_extent, lat_to_y, lon_to_x, x_to_lon, y_to_lat

BBOXES = [(95, 18, 125, 45), (-11, 35, 32, 60), (100, 20, 101, 40)]


@pytest.mark.parametrize("bbox", BBOXES)
def test_center_maps_to_pixel_center(bbox):
    ext = fit_extent(bbox, 3840, 2160)
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    # Centre in Mercator metres (not the lat midpoint, which is not the visual centre).
    lon_c = x_to_lon((ext.min_x + ext.max_x) / 2)
    lat_c = y_to_lat((ext.min_y + ext.max_y) / 2)
    px, py = ext.lonlat_to_px(lon_c, lat_c)
    assert px == pytest.approx(1920, abs=1e-6)
    assert py == pytest.approx(1080, abs=1e-6)
    # The requested bbox centre (in Mercator) is preserved by the expansion.
    req_cx = (lon_to_x(bbox[0]) + lon_to_x(bbox[2])) / 2
    req_cy = (lat_to_y(bbox[1]) + lat_to_y(bbox[3])) / 2
    assert ext.lonlat_to_px(x_to_lon(req_cx), y_to_lat(req_cy)) == pytest.approx((1920, 1080))


@pytest.mark.parametrize("bbox", BBOXES)
def test_corners_map_to_image_corners(bbox):
    ext = fit_extent(bbox, 3840, 2160)
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    assert ext.lonlat_to_px(min_lon, max_lat) == pytest.approx((0, 0), abs=1e-6)
    assert ext.lonlat_to_px(max_lon, min_lat) == pytest.approx((3840, 2160), abs=1e-6)
    assert ext.lonlat_to_px(max_lon, max_lat) == pytest.approx((3840, 0), abs=1e-6)
    assert ext.lonlat_to_px(min_lon, min_lat) == pytest.approx((0, 2160), abs=1e-6)


@pytest.mark.parametrize("bbox", BBOXES)
def test_expansion_keeps_aspect_and_contains_request(bbox):
    ext = fit_extent(bbox, 3840, 2160)
    assert (ext.max_x - ext.min_x) / (ext.max_y - ext.min_y) == pytest.approx(16 / 9)
    min_lon, min_lat, max_lon, max_lat = ext.bbox_lonlat
    assert min_lon <= bbox[0] + 1e-9 and max_lon >= bbox[2] - 1e-9
    assert min_lat <= bbox[1] + 1e-9 and max_lat >= bbox[3] - 1e-9


def test_rejects_invalid_bbox():
    with pytest.raises(ValueError):
        fit_extent((10, 10, 5, 20), 3840, 2160)
