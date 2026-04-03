/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import SessionRouter from './pages/SessionRouter';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#05050f] text-[#e8e8ff] font-sans selection:bg-[#00e5ff]/30">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateSession />} />
            <Route path="/session/:sessionId/*" element={<SessionRouter />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
