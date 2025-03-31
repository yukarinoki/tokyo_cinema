import React, { useState, useEffect } from 'react';
import MovieList from './components/MovieList';
import TheaterMap from './components/TheaterMap';
import { Theater, UserLocation, MovieWithTheater } from './types';
import { getUserLocation, calculateTheaterDistances, getAllMoviesWithTheaters } from './utils';
import './App.css';

// Sample data path - in a real app, this would be fetched from an API
const SAMPLE_DATA_PATH = '/data/movie_schedules_latest.json';

const App: React.FC = () => {
  const [theaters, setTheaters] = useState<Theater[]>([]);
  const [moviesWithTheaters, setMoviesWithTheaters] = useState<MovieWithTheater[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load movie data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(SAMPLE_DATA_PATH);
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }
        
        const data: Theater[] = await response.json();
        setTheaters(data);
        
        // Get user location
        try {
          const location = await getUserLocation();
          setUserLocation(location);
          
          // Calculate distances
          const theatersWithDistances = calculateTheaterDistances(data, location);
          setTheaters(theatersWithDistances);
          
          // Get all movies with theater info
          const allMovies = getAllMoviesWithTheaters(theatersWithDistances);
          setMoviesWithTheaters(allMovies);
        } catch (locationError) {
          console.error('Error getting user location:', locationError);
          // Still set the theaters and movies even without location
          setMoviesWithTheaters(getAllMoviesWithTheaters(data));
        }
        
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>東京映画館スケジュールファインダー</h1>
        <div className="search-container">
          <input
            type="text"
            placeholder="映画名または映画館名で検索..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
          />
        </div>
      </header>

      <main className="app-main">
        {loading ? (
          <div className="loading">
            <p>データを読み込み中...</p>
          </div>
        ) : error ? (
          <div className="error">
            <p>エラーが発生しました: {error}</p>
          </div>
        ) : (
          <>
            <section className="map-section">
              <h2>映画館マップ</h2>
              <TheaterMap theaters={theaters} userLocation={userLocation} />
            </section>

            <section className="movies-section">
              <MovieList movies={moviesWithTheaters} searchTerm={searchTerm} />
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>© 2025 東京映画館スケジュールファインダー</p>
      </footer>
    </div>
  );
};

export default App;
