import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import CodingScreen from './pages/CodingScreen';
import CaseList from './pages/CaseList';
import Analysis from './pages/Analysis';
import MapView from './pages/MapView';
import ImportBulletin from './pages/ImportBulletin';
import SimilarCasesPage from './pages/SimilarCasesPage';
import LinkageScreen from './pages/LinkageScreen';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<CodingScreen />} />
          <Route path="/code/:reportId" element={<CodingScreen />} />
          <Route path="/cases" element={<CaseList />} />
          <Route path="/import" element={<ImportBulletin />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/similar/:reportId" element={<SimilarCasesPage />} />
          <Route path="/linkage/:reportIdA/:reportIdB" element={<LinkageScreen />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
