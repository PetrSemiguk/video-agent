"""Source descriptions and attribution texts embedded into plate metadata.

Keep these texts identical to docs/licenses.md.
"""

from __future__ import annotations

TERRAIN_FULL_ATTRIBUTION = """\
* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and
  funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM)
  Österreich;
* Canada terrain data contains information licensed under the Open Government
  Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
  Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right
  2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data
  courtesy of the U.S. Geological Survey."""

BLUE_MARBLE = {
    "id": "nasa-bmng",
    "name": "NASA Blue Marble: Next Generation (topography + bathymetry, 500 m)",
    "license": "Public domain (NASA)",
    "url": "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/",
    "on_screen": "Imagery: NASA Earth Observatory",
    "full": 'Blue Marble: Next Generation imagery courtesy of "NASA Earth Observatory" '
    "(Reto Stöckli, NASA Goddard Space Flight Center).",
}

TERRAIN = {
    "id": "aws-terrain-tiles",
    "name": "AWS Terrain Tiles (Mapzen/Tilezen joerd), terrarium",
    "license": "Mixed open sources, per-source terms (see tilezen/joerd docs/attribution.md)",
    "url": "https://registry.opendata.aws/terrain-tiles/",
    "on_screen": "Terrain: USGS, NOAA, EU-DEM (Copernicus) et al. via AWS Terrain Tiles",
    "full": TERRAIN_FULL_ATTRIBUTION,
}


def attribution(use_terrain: bool) -> dict:
    """Sources list plus the combined on-screen line and full (description) text."""
    sources = [BLUE_MARBLE] + ([TERRAIN] if use_terrain else [])
    return {
        "sources": sources,
        "on_screen": " · ".join(s["on_screen"] for s in sources),
        "full": "\n\n".join(s["full"] for s in sources),
    }
