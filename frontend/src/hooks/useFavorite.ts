import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  pushFavoriteChange,
  toggleFavorite,
} from '../features/player/playerSlice';
import type { RadioStation } from '../types';
import { useToast } from '../components/Toast';

/**
 * Favourite toggle bound to the player slice, with confirmation toasts.
 * Persists in localStorage immediately and mirrors the change to the backend
 * when the user is signed in. Accepts `null` so overlays can call it before
 * their station guard: with `null` the toggle is a no-op.
 */
export function useFavorite(station: RadioStation | null) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const isFavorite = useAppSelector((state) =>
    station ? state.player.favoriteIds.includes(station.id) : false,
  );

  const toggle = () => {
    if (!station) {
      return;
    }
    dispatch(toggleFavorite(station));
    if (isFavorite) {
      showToast(`“${station.name}” rimossa dai preferiti`, 'info');
    } else {
      showToast(`“${station.name}” aggiunta ai preferiti`, 'success');
    }
    void dispatch(
      pushFavoriteChange({ radioId: station.id, added: !isFavorite }),
    );
  };

  return { isFavorite, toggle };
}
