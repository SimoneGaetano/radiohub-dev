import { useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { FavoritesSection } from './components/FavoritesSection';
import { Header } from './components/Header';
import { NewsSection } from './components/NewsSection';
import { Player } from './components/Player';
import { RadioGrid } from './components/RadioGrid';
import { RecentStations } from './components/RecentStations';
import { SearchBar } from './components/SearchBar';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header onOpenAuth={() => setAuthOpen(true)} />

        <main className="mx-auto max-w-7xl space-y-8 px-4 pb-36 pt-6">
          <SearchBar />
          <RadioGrid />
          <RecentStations />
          <FavoritesSection />
          <NewsSection />
        </main>

        <Player />

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    </ToastProvider>
  );
}