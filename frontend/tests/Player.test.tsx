import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Player } from '../src/components/Player';
import { playStation, togglePlay } from '../src/features/player/playerSlice';
import type { RadioStation } from '../src/types';
import { makeStore, renderApp } from './helpers/renderApp';

/**
 * `hls.js` non può funzionare in jsdom: il modulo è simulato per verificare che
 * il Player lo **usi** per gli stream `.m3u8` (F2) e non per gli altri.
 * Il nome inizia per `mock` perché `vi.mock` è issato sopra gli import.
 */
const mockHls = {
  instances: [] as Array<{
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
};

vi.mock('hls.js', () => {
  class HlsMock {
    static isSupported = (): boolean => true;
    static Events = { ERROR: 'hlsError' };
    loadSource = vi.fn();
    attachMedia = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
    constructor() {
      mockHls.instances.push({
        loadSource: this.loadSource,
        attachMedia: this.attachMedia,
        destroy: this.destroy,
      });
    }
  }
  return { default: HlsMock };
});

const STATION: RadioStation = {
  id: 'r1',
  name: 'Radio Uno',
  url: 'https://stream.example/live',
  favicon: '',
  country: 'Italy',
  countryCode: 'IT',
  language: 'italian',
  tags: [],
  votes: 1,
  codec: 'MP3',
  bitrate: 128,
};

const HLS_STATION: RadioStation = {
  ...STATION,
  id: 'r2',
  name: 'Radio HLS',
  url: 'https://stream.example/live.m3u8',
};

/**
 * `playStation` **avvia già** la riproduzione: per partire in pausa serve un
 * `togglePlay` in più, altrimenti lo stato del test non è quello che sembra.
 */
function storeWithStation(station: RadioStation, playing = true) {
  const store = makeStore();
  store.dispatch(playStation(station));
  if (!playing) {
    store.dispatch(togglePlay());
  }
  return store;
}

beforeEach(() => {
  mockHls.instances.length = 0;
  vi.clearAllMocks();
});

describe('Player — barra persistente (F2)', () => {
  it('senza stazione non renderizza nulla', () => {
    const { container } = renderApp(<Player />, makeStore());

    // Il contenitore ospita anche il provider dei toast: qui interessa che il
    // Player non abbia prodotto né audio né controlli.
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByLabelText('Volume')).not.toBeInTheDocument();
  });

  it('mostra nome e controlli della stazione corrente', () => {
    renderApp(<Player />, storeWithStation(STATION));

    expect(screen.getByText('Radio Uno')).toBeInTheDocument();
    expect(screen.getByLabelText('Pausa')).toBeInTheDocument();
    expect(screen.getByLabelText('Volume')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Apri il player a schermo intero'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Chiudi completamente il player'),
    ).toBeInTheDocument();
  });

  it('il pulsante play avvia davvero il flusso e diventa "Pausa"', async () => {
    const user = userEvent.setup();
    const store = storeWithStation(STATION, false);
    renderApp(<Player />, store);

    await user.click(screen.getByLabelText('Riproduci'));

    expect(store.getState().player.isPlaying).toBe(true);
    expect(screen.getByLabelText('Pausa')).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(HTMLMediaElement.prototype.play)).toHaveBeenCalled(),
    );
  });

  it('la barra spaziatrice mette in pausa (controllo da tastiera)', async () => {
    const user = userEvent.setup();
    const store = storeWithStation(STATION, true);
    renderApp(<Player />, store);

    await user.keyboard(' ');

    expect(store.getState().player.isPlaying).toBe(false);
  });

  it('il tasto di chiusura svuota il player e fa sparire la barra', async () => {
    const user = userEvent.setup();
    const store = storeWithStation(STATION);
    const { container } = renderApp(<Player />, store);

    await user.click(screen.getByLabelText('Chiudi completamente il player'));

    expect(store.getState().player.current).toBeNull();
    expect(screen.queryByText('Radio Uno')).not.toBeInTheDocument();
    expect(container.querySelector('audio')).toBeNull();
  });

  it('il cursore del volume aggiorna lo stato (0-1)', () => {
    const store = storeWithStation(STATION);
    renderApp(<Player />, store);

    fireEvent.change(screen.getByLabelText('Volume'), {
      target: { value: '30' },
    });

    expect(store.getState().player.volume).toBeCloseTo(0.3);
  });

  it('una sorgente diretta finisce nell elemento audio, senza hls.js', () => {
    const { container } = renderApp(<Player />, storeWithStation(STATION));

    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect((audio as HTMLAudioElement).src).toBe(STATION.url);
    expect(mockHls.instances).toHaveLength(0);
  });

  it('una sorgente .m3u8 passa da hls.js', () => {
    renderApp(<Player />, storeWithStation(HLS_STATION));

    expect(mockHls.instances).toHaveLength(1);
    expect(mockHls.instances[0]?.loadSource).toHaveBeenCalledWith(
      HLS_STATION.url,
    );
    expect(mockHls.instances[0]?.attachMedia).toHaveBeenCalled();
  });
});
