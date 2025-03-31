import React from 'react';
import { MovieWithTheater } from '../types';
import MovieItem from './MovieItem';

interface MovieListProps {
  movies: MovieWithTheater[];
  searchTerm: string;
}

const MovieList: React.FC<MovieListProps> = ({ movies, searchTerm }) => {
  // Filter movies by search term
  const filteredMovies = searchTerm
    ? movies.filter(movie => 
        movie.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        movie.theater.theater_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : movies;
  
  // Sort movies by distance
  const sortedMovies = [...filteredMovies].sort((a, b) => {
    const distanceA = a.theater.distance || Number.MAX_VALUE;
    const distanceB = b.theater.distance || Number.MAX_VALUE;
    return distanceA - distanceB;
  });
  
  return (
    <div className="movie-list">
      <h2>映画一覧 ({sortedMovies.length}件)</h2>
      {sortedMovies.length === 0 ? (
        <p className="no-results">映画が見つかりませんでした。</p>
      ) : (
        <div className="movie-grid">
          {sortedMovies.map((movie, index) => (
            <MovieItem key={`${movie.title}-${movie.theater.theater_name}-${index}`} movie={movie} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MovieList;
