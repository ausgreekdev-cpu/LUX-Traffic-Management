import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';

// Module-level so repeated chunk failures in one page session never loop.
let autoReloaded = false;

const CHUNK_RE = /dynamically imported module|loading chunk|failed to fetch/i;

export default function ChunkErrorElement() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : (error && (error.message || String(error))) || 'Unknown error';

  useEffect(() => {
    if (!is404 && !autoReloaded && CHUNK_RE.test(message)) {
      autoReloaded = true;
      window.location.reload();
    }
  }, [is404, message]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-lg w-full space-y-3 text-center">
        <h2 className="text-lg font-bold text-red-500">
          {is404 ? 'Page not found' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-gray-500">
          {is404 ? 'That page does not exist.' : 'Please reload to continue.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Reload
        </button>
      </div>
    </div>
  );
}