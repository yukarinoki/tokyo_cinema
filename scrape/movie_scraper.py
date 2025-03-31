import argparse
import csv
import json
import os
import time
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from enum import Enum
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("movie_scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Constants
THEATERS_CSV_PATH = "scrape/theater_names.csv"
OUTPUT_DIR = "data"
OUTPUT_FILE = os.path.join(
    OUTPUT_DIR, f"movie_schedules_{datetime.now().strftime('%Y%m%d')}.json")
GOOGLE_API_KEY = "AIzaSyB8LAcUuBS0wxplVzdSx-FjM-KPBgtRF8Q"  # From google_it.py


class TheaterSeries(Enum):
    TOHO = 1
    MOVIX = 2
    AEON = 3
    TJOY = 4
    UNITED = 5
    OTHER = 99


def get_theater_series(theater_name):
    """Determine the theater series based on the theater name"""
    if "TOHOシネマズ" in theater_name:
        return TheaterSeries.TOHO
    elif "MOVIX" in theater_name:
        return TheaterSeries.MOVIX
    elif "イオンシネマ" in theater_name:
        return TheaterSeries.AEON
    elif "ジョイ" in theater_name:
        return TheaterSeries.TJOY
    elif "ユナイテッド" in theater_name:
        return TheaterSeries.UNITED
    else:
        return TheaterSeries.OTHER


def get_theater_url(theater_name, theater_name_en):
    """Get the URL for a theater's website using Google search"""
    search_query = f"{theater_name}  上映スケジュール"

    # Use Google Custom Search API
    search_url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "key": GOOGLE_API_KEY,
        "cx": "312bad798623b4c09",  # This is a placeholder, you need a real cx value
        "q": search_query
    }

    try:
        response = requests.get(search_url, params=params)
        # Debugging line
        logger.info(
            f"Google search response: {response.status_code} {response.text}")
        if response.status_code == 200:
            data = response.json()
            # logger.info(f"Google search data:", data["items"])  # Debugging line
            if "items" in data and len(data["items"]) > 0:
                return data["items"][0]["link"]
    except Exception as e:
        logger.error(f"Error searching for theater URL: {e}")

    # Fallback URLs based on theater series
    series = get_theater_series(theater_name)
    if series == TheaterSeries.TOHO:
        # Extract location from name (e.g., "TOHOシネマズ新宿" -> "shinjuku")
        location = theater_name.replace("TOHOシネマズ", "").lower()
        return f"https://hlo.tohotheater.jp/net/schedule/076/TNMV0060.do"

    # For other theaters, return None and log that we couldn't find a URL
    logger.warning(f"Could not find URL for theater: {theater_name}")
    return None


def setup_webdriver():
    """Set up and return a headless Chrome webdriver"""
    chrome_options = Options()
    # chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")

    try:
        driver = webdriver.Chrome(options=chrome_options)
        return driver
    except Exception as e:
        logger.error(f"Error setting up webdriver: {e}")
        return None


def scrape_toho_cinemas(driver, url, theater_name, theater_info):
    """Scrape movie schedules from TOHO Cinemas website"""
    logger.info(f"Scraping TOHO Cinemas: {theater_name}")

    try:
        driver.get(url)
        # Wait for the page to load
        # Debugging line to check the title
        logger.info("Title: %s", driver.title)
        WebDriverWait(driver, 10)
        logger.info("Page loaded successfully")
        # Get the page source after JavaScript has executed
        html = driver.page_source
        # Debugging line to check the HTML content
        logger.info(f"html: {html}")
        soup = BeautifulSoup(html, "html.parser")

        movies = []
        # Find all movie sections
        movie_sections = soup.select(
            "#theater-schedule > div.schedule.main > div.schedule-body.js-schedule-body > section")
        logger.info(f"Found {len(movie_sections)} movie sections")

        for section in movie_sections:
            # Get movie title
            title_elem = section.select_one(".schedule-title")
            if not title_elem:
                continue

            movie_title = title_elem.get_text(strip=True)

            # Get showtimes
            showtime_elems = section.select(".time-schedule-item")
            showtimes = []

            for elem in showtime_elems:
                time_text = elem.get_text(strip=True)
                if time_text:
                    showtimes.append(time_text)

            if showtimes:
                movies.append({
                    "title": movie_title,
                    "showtimes": showtimes
                })

        return {
            "theater_name": theater_name,
            "theater_name_en": theater_info.get("theater_name_en", theater_name),
            "address": theater_info.get("address", ""),
            "latitude": theater_info.get("latitude", 0),
            "longitude": theater_info.get("longitude", 0),
            "movies": movies,
            "scrape_date": datetime.now().strftime("%Y-%m-%d")
        }

    except Exception as e:
        logger.error(f"Error scraping TOHO Cinemas {theater_name}: {e}")
        return None


def scrape_generic_theater(driver, url, theater_name, theater_info):
    """
    Generic scraper for theaters that don't have a specific scraper implementation.
    This is a fallback that attempts to find movie titles and showtimes based on common patterns.
    """
    logger.info(f"Using generic scraper for: {theater_name}")

    try:
        driver.get(url)
        # Wait for the page to load (adjust selector as needed)
        time.sleep(5)  # Simple wait as a fallback

        # Get the page source after JavaScript has executed
        html = driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        # Look for common patterns in movie websites
        movies = []

        # Try different selectors that might contain movie information
        movie_elements = (
            soup.select(".movie-item") or
            soup.select(".schedule-movie") or
            soup.select(".movie") or
            soup.select("article") or
            soup.select(".content-block")
        )

        if not movie_elements:
            logger.warning(f"Could not find movie elements for {theater_name}")
            return None

        for elem in movie_elements:
            # Try to find the movie title
            title_elem = (
                elem.select_one(".title") or
                elem.select_one("h2") or
                elem.select_one("h3") or
                elem.select_one("strong")
            )

            if not title_elem:
                continue

            movie_title = title_elem.get_text(strip=True)

            # Try to find showtimes
            time_elems = (
                elem.select(".time") or
                elem.select(".showtime") or
                elem.select("time") or
                elem.select(".schedule-time")
            )

            showtimes = []
            for time_elem in time_elems:
                time_text = time_elem.get_text(strip=True)
                # Ensure it contains digits
                if time_text and any(c.isdigit() for c in time_text):
                    showtimes.append(time_text)

            if movie_title and showtimes:
                movies.append({
                    "title": movie_title,
                    "showtimes": showtimes
                })

        return {
            "theater_name": theater_name,
            "theater_name_en": theater_info.get("theater_name_en", theater_name),
            "address": theater_info.get("address", ""),
            "latitude": theater_info.get("latitude", 0),
            "longitude": theater_info.get("longitude", 0),
            "movies": movies,
            "scrape_date": datetime.now().strftime("%Y-%m-%d")
        }

    except Exception as e:
        logger.error(f"Error using generic scraper for {theater_name}: {e}")
        return None


def scrape_theater(driver, theater_name, theater_info):
    """Scrape movie schedules for a specific theater"""
    theater_name_en = theater_info.get(
        "theater_name_en", theater_name)  # Fallback to theater_name if theater_name_en is not present
    url = get_theater_url(theater_name, theater_name_en)
    logger.info(f"URL for {theater_name}: {url}")
    if not url:
        logger.warning(f"No URL found for theater: {theater_name}")
        return None

    series = get_theater_series(theater_name)

    if series == TheaterSeries.TOHO:
        return scrape_toho_cinemas(driver, url, theater_name, theater_info)
    else:
        # For other theaters, use the generic scraper
        return scrape_generic_theater(driver, url, theater_name, theater_info)


def load_theaters():
    """Load theater information from CSV file"""
    theaters = []
    try:
        with open(THEATERS_CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                theaters.append(row)
        return theaters
    except Exception as e:
        logger.error(f"Error loading theaters from CSV: {e}")
        return []


def save_results(results):
    """Save scraping results to a JSON file"""
    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        logger.info(f"Results saved to {OUTPUT_FILE}")
    except Exception as e:
        logger.error(f"Error saving results: {e}")


def main():
    """Main function to scrape movie schedules from all theaters"""
    parser = argparse.ArgumentParser(
        description="Scrape movie schedules from Tokyo theaters"
    )
    parser.add_argument("--limit", type=int,
                        help="Limit the number of theaters to scrape")
    parser.add_argument("--theater", help="Scrape only the specified theater")
    args = parser.parse_args()

    # Load theaters from CSV
    theaters = load_theaters()
    if not theaters:
        logger.error("No theaters found in CSV file")
        return

    # Filter theaters if specified
    if args.theater:
        theaters = [t for t in theaters if t["theater_name"] == args.theater]
        if not theaters:
            logger.error(f"Theater '{args.theater}' not found in CSV file")
            return

    if args.limit and args.limit > 0:
        theaters = theaters[:args.limit]

    # Set up webdriver
    driver = setup_webdriver()
    if not driver:
        logger.error("Failed to set up webdriver")
        return

    try:
        # Scrape each theater
        results = []
        for theater in theaters:
            theater_name = theater["theater_name"]
            logger.info(f"Processing theater: {theater_name}")

            result = scrape_theater(driver, theater_name, theater)
            if result:
                results.append(result)
                logger.info(f"Successfully scraped {theater_name}")
            else:
                logger.warning(f"Failed to scrape {theater_name}")

        # Save results
        save_results(results)
        logger.info(f"Scraped {len(results)} theaters")

    finally:
        # Clean up
        driver.quit()
        logger.info("Scraping completed")


if __name__ == "__main__":
    main()
