import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store';

/** Typed `useDispatch`, aware of thunks. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/** Typed `useSelector`. */
export const useAppSelector = useSelector.withTypes<RootState>();
