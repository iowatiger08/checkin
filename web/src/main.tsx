import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import EventsList from './EventsList';
import Checkin from './Checkin';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EventsList />} />
        <Route path="/events/:eventId" element={<Checkin />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
