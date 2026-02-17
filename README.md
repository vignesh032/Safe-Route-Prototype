HEAD

# Safe-Route-Prototype

﻿# SafeRoute Hyderabad Prototype

Simple web prototype for women-focused travel assistance:

- Enter `From` and `To`
- Gets route alternatives from Google Maps Directions API
- Shows shortest route and a lower-risk alternative using Hyderabad hotspot weights

## Run

1. Open `index.html`
2. Replace `YOUR_GOOGLE_MAPS_API_KEY` in `index.html` with your key
3. Ensure these Google APIs are enabled for your project:
   - Maps JavaScript API
   - Directions API
   - Places API

## Notes

- Crime-risk values are demo placeholders in `hyderabad_crime_hotspots.js`.
- For real deployment, replace hotspots with official police/open-data records and a backend risk service.
  > > > > > > > fb6ae57 (added files)
