import { HashRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const Home = lazy(() => import('./pages/Home'));
const Execution = lazy(() => import('./pages/Execution'));
const ScopeChain = lazy(() => import('./pages/ScopeChain'));
const ThisBinding = lazy(() => import('./pages/ThisBinding'));
const PrototypeChain = lazy(() => import('./pages/PrototypeChain'));
const RecursionTree = lazy(() => import('./pages/Recursion'));
const EventLoop = lazy(() => import('./pages/EventLoop'));

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/execution" element={<Execution />} />
          <Route path="/scope" element={<ScopeChain />} />
          <Route path="/this" element={<ThisBinding />} />
          <Route path="/prototype" element={<PrototypeChain />} />
          <Route path="/recursion" element={<RecursionTree />} />
          <Route path="/event-loop" element={<EventLoop />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
