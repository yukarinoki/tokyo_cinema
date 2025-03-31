import { Theater, UserLocation, MovieWithTheater } from './types';

/**
 * Calculate the distance between two points using the Haversine formula
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

/**
 * Convert degrees to radians
 * @param deg Degrees
 * @returns Radians
 */
function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Get the user's current location
 * @returns Promise that resolves to the user's location
 */
export function getUserLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        }
      );
    }
  });
}

/**
 * Calculate the distance from the user to each theater
 * @param theaters List of theaters
 * @param userLocation User's location
 * @returns Theaters with distance property added
 */
export function calculateTheaterDistances(
  theaters: Theater[],
  userLocation: UserLocation
): Theater[] {
  return theaters.map((theater) => {
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      theater.latitude,
      theater.longitude
    );
    return { ...theater, distance };
  });
}

/**
 * Get all movies from all theaters, with theater information
 * @param theaters List of theaters
 * @returns List of movies with theater information
 */
export function getAllMoviesWithTheaters(theaters: Theater[]): MovieWithTheater[] {
  const moviesWithTheaters: MovieWithTheater[] = [];
  
  theaters.forEach((theater) => {
    theater.movies.forEach((movie) => {
      moviesWithTheaters.push({
        ...movie,
        theater,
      });
    });
  });
  
  return moviesWithTheaters;
}

/**
 * Format a distance in kilometers to a human-readable string
 * @param distance Distance in kilometers
 * @returns Formatted distance string
 */
export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  }
  return `${distance.toFixed(1)}km`;
}
