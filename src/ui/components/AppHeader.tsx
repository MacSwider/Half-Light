import React from 'react';
import iconImage from '../assets/icon.png';

export const AppHeader: React.FC = () => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <div className="header-title-container">
            <img src={iconImage} alt="Half-Light Icon" className="app-icon" />
            <h1>Half-Light</h1>
          </div>
          <p>Just turn it</p>
        </div>
      </div>
    </header>
  );
};

