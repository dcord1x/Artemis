import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
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
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* Landing page — full screen, no nav */}
          <Route path="/" element={<LandingPage />} />

          {/* App pages — wrapped in nav Layout */}
          <Route element={<AppLayout />}>
            <Route path="/code" element={<CodingScreen />} />
            <Route path="/code/:reportId" element={<CodingScreen />} />
            <Route path="/cases" element={<CaseList />} />
            <Route path="/import" element={<ImportBulletin />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/map" element={<MapView />} />
            <Route path="/similar/:reportId" element={<SimilarCasesPage />} />
            <Route path="/linkage/:reportIdA/:reportIdB" element={<LinkageScreen />} />
            <Route path="/research" element={<ResearchOutputs />} />
            <Route path="/bulletin" element={<BulletinOutput />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
