import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function Tetris() {
  return (
    <div className="Tetris">
      <h1>Tetris Game</h1>
      <p>Game will be here</p>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Tetris />
  </React.StrictMode>
);