import { useEffect, useState } from 'react';
import { useAppDispatch } from './app/hooks';
import { AuthModal } from './components/AuthModal';
import { Header } from './components/Header';
import { NewsSection } from './components/NewsSection';
import { Player } from './components/Player';
import { RadioGrid } from './components/RadioGrid';
import { SearchBar } from './components/SearchBar';
import { ToastProvider } from './components/Toast';
import { fetchPosts } from './features/posts/postsSlice';

export default function App() {
  const dispatch = useAppDispatch();
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    void dispatch(fetchPosts());
  }, [dispatch]);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header onOpenAuth={() => setAuthOpen(true)} />

        <main className="mx-auto max-w-7xl space-y-8 px-4 pb-36 pt-6">
          <SearchBar />
          <RadioGrid />
          <NewsSection />
        </main>

        <Player />

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    </ToastProvider>
  );
}