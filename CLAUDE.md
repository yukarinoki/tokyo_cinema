# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
日本語で応答するようにしてください。

## Project Overview

Tokyo Cinema Schedule Finder (東京映画館スケジュールファインダー) is a web application that scrapes movie schedules from Tokyo cinema chains and displays them in a location-aware interface. The project consists of a Python scraper and a React TypeScript web app.

## Common Commands

### Python Scraper Commands
```bash
# Scrape all theaters
python scrape/movie_scraper.py

# Scrape with limit
python scrape/movie_scraper.py --limit 5

# Scrape specific theater
python scrape/movie_scraper.py --theater "TOHOシネマズ新宿"
```

### Web App Commands
```bash
# Development
cd webapp
npm install
npm start

# Build production
npm run build

# Run tests (Create React App default)
npm test

# Run single test file
npm test -- --testNamePattern="ComponentName"
```

## Architecture Overview

### Python Scraper Architecture

The scraper uses a theater-specific strategy pattern with specialized scrapers for each cinema chain:

**Key Files:**
- `scrape/movie_scraper.py`: Main scraper with theater-specific functions
- `scrape/theater_names.csv`: 80+ Tokyo theaters with coordinates
- `scrape/theater_names.py`: Generates theater list from jorudan.co.jp

**Scraper Flow:**
1. Load theaters from CSV
2. Use Google Custom Search API to find theater URLs
3. Apply theater-specific scraper (TOHO, AEON, MOVIX, T-JOY, United) or generic fallback
4. Normalize movie titles (handles 字幕/吹替, IMAX/4DX tags)
5. Save to `data/movie_schedules_YYYYMMDD.json`

**Cinema Chain Scrapers:**
- `scrape_toho_cinemas()`: Uses Selenium for JavaScript-rendered content
- `scrape_aeon_cinema()`: BeautifulSoup parser with specific selectors
- `scrape_movix()`: Handles MOVIX-specific HTML structure
- `scrape_tjoy()`: T-JOY theater scraper
- `scrape_united_cinemas()`: United Cinemas scraper
- `scrape_generic()`: Fallback for other theaters

### React TypeScript Web App Architecture

**Component Structure:**
- `App.tsx`: Main component, handles data fetching and state management
- `components/MovieList.tsx`: Displays movies sorted by distance
- `components/MovieItem.tsx`: Individual movie display
- `components/TheaterMap.tsx`: Leaflet map showing theater locations
- `utils.ts`: Distance calculations and data transformations
- `types.ts`: TypeScript interfaces

**Data Flow:**
1. App loads JSON from `/public/data/movie_schedules_latest.json`
2. Requests user geolocation permission
3. Calculates distances to all theaters using Haversine formula
4. Sorts movies by nearest theater
5. Displays results with search functionality

**Key Features:**
- Location-based sorting (requires user permission)
- Real-time search filtering
- Interactive map with theater markers
- Responsive design for mobile/desktop

## Data Format

Scraper outputs JSON with this structure:
```json
{
  "theater_name": "TOHOシネマズ新宿",
  "theater_name_en": "TOHO Cinemas Shinjuku",
  "address": "東京都新宿区...",
  "latitude": 35.689,
  "longitude": 139.700,
  "movies": [{
    "title": "Movie Title",
    "subtitle": "字幕",
    "screen_type": "IMAX",
    "showtimes": [["10:00", "12:30"], ["13:00", "15:30"]]
  }],
  "scrape_date": "2025-01-28"
}
```

## Key Dependencies

**Python (requirements not formalized):**
- selenium
- beautifulsoup4
- requests
- webdriver-manager
- geopy
- googletrans

**React:**
- react, react-dom (v18)
- typescript (v4.9)
- leaflet, react-leaflet (maps)
- react-scripts (Create React App)

## Development Notes

1. **API Keys**: The scraper contains a Google API key in `movie_scraper.py` - should be moved to environment variables
2. **Data Updates**: Run scraper daily via cron for fresh data
3. **No Backend**: Currently uses static JSON files - consider API for real-time data
4. **Error Handling**: Scraper continues on individual theater failures
5. **Testing**: No automated tests currently implemented
6. **Linting**: No linting configuration beyond Create React App defaults
