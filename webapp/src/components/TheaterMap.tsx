import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Theater, UserLocation } from '../types';
import { formatDistance } from '../utils';

interface TheaterMapProps {
  theaters: Theater[];
  userLocation: UserLocation | null;
}

const TheaterMap: React.FC<TheaterMapProps> = ({ theaters, userLocation }) => {
  // Default center to Tokyo if user location is not available
  const center = userLocation 
    ? [userLocation.latitude, userLocation.longitude] 
    : [35.6812, 139.7671]; // Tokyo coordinates
  
  return (
    <div className="theater-map">
      <MapContainer 
        center={center as [number, number]} 
        zoom={12} 
        style={{ height: '400px', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* User location marker */}
        {userLocation && (
          <Marker position={[userLocation.latitude, userLocation.longitude]}>
            <Popup>
              あなたの現在地
            </Popup>
          </Marker>
        )}
        
        {/* Theater markers */}
        {theaters.map((theater) => (
          <Marker 
            key={`${theater.theater_name}-${theater.latitude}-${theater.longitude}`}
            position={[theater.latitude, theater.longitude]}
          >
            <Popup>
              <div>
                <h4>{theater.theater_name}</h4>
                <p>{theater.address}</p>
                {theater.distance !== undefined && (
                  <p>距離: {formatDistance(theater.distance)}</p>
                )}
                <p>上映中の映画: {theater.movies.length}本</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default TheaterMap;
