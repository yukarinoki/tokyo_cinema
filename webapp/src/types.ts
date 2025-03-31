export interface Movie {
  title: string;
  showtimes: string[];
}

export interface Theater {
  theater_name: string;
  theater_name_en: string;
  address: string;
  latitude: number;
  longitude: number;
  movies: Movie[];
  scrape_date: string;
  distance?: number; // Distance from user's location (added at runtime)
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface MovieWithTheater extends Movie {
  theater: Theater;
}
