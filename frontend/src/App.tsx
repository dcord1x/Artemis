import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { MapsProvider } from './context/MapsContext';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import LandingPage from './pages/LandingPage';
import CodingScreen from './pages/CodingScreen';
import CaseList from './pages/CaseList';
import Analysis from './pages/Analysis';
import MapView from './pages/MapView';
import ImportBulletin from './pages/ImportBulletin';
import SimilarCasesPage from './pages/SimilarCasesPage';
import LinkageScreen from './pages/LinkageScreen';
import ResearchOutputs from './pages/ResearchOutputs';
import BulletinOutput from './pages/BulletinOutput';

function AppLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <MapsProvider>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* Splash — full screen, no nav */}
          <Route path="/welcome" element={<LandingPage />} />

          {/* Default: redirect / to analytic overview */}
          <Route path="/" element={<Navigate to="/analysis" replace />} />

          {/* App pages — wrapped in nav Layout */}
          <Route element={<AppLayout />}>
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/cases" element={<CaseList />} />
            <Route path="/code" element={<CodingScreen />} />
            <Route path="/code/:reportId" element={<CodingScreen />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/research" element={<ResearchOutputs />} />
            <Route path="/bulletin" element={<BulletinOutput />} />
            <Route path="/import" element={<ImportBulletin />} />
            <Route path="/similar/:reportId" element={<SimilarCasesPage />} />
            <Route path="/linkage/:reportIdA/:reportIdB" element={<LinkageScreen />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
    </MapsProvider>
  );
}
