import React from 'react';
import { MovieWithTheater } from '../types';
import { formatDistance } from '../utils';

interface MovieItemProps {
  movie: MovieWithTheater;
}

const MovieItem: React.FC<MovieItemProps> = ({ movie }) => {
  const { title, showtimes, theater } = movie;
  
  return (
    <div className="movie-item">
      <h3 className="movie-title">{title}</h3>
      <div className="theater-info">
        <h4>{theater.theater_name}</h4>
        <p className="theater-address">{theater.address}</p>
        {theater.distance !== undefined && (
          <p className="theater-distance">
            距離: <strong>{formatDistance(theater.distance)}</strong>
          </p>
        )}
      </div>
      <div className="showtimes">
        <h5>上映時間:</h5>
        <ul className="showtime-list">
          {showtimes.map((time, index) => (
            <li key={index} className="showtime">{time}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MovieItem;
