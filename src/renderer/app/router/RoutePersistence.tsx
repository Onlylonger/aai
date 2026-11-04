import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const LAST_ROUTE_KEY = 'last-route';

export function RoutePersistence() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname;

    localStorage.setItem(LAST_ROUTE_KEY, pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
}
