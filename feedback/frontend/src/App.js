import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { useState } from "react";
import NavBar from "./components/NavBar";
import UploadPage from "./pages/UploadPage";
import AdminPage from "./pages/AdminPage";
import { AdminProvider } from "./context/AdminContext";
import { PageStateProvider } from "./context/PageStateContext";
import DashboardPage from "./pages/DashboardPage";
import NegativeFeedbackPage from "./pages/NegativeFeedbackPage";
import DirectorLoginPage from "./pages/DirectorLoginPage";
import DirectorDashboardPage from "./pages/DirectorDashboardPage";

function DirectorPortal() {
  const [director, setDirector] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("director") || "null"); }
    catch { return null; }
  });

  const onLogin = (rows) => {
    sessionStorage.setItem("director", JSON.stringify(rows));
    setDirector(rows);
  };

  const onLogout = () => {
    sessionStorage.removeItem("director");
    setDirector(null);
  };

  if (!director) return <DirectorLoginPage onLogin={onLogin} />;
  return <DirectorDashboardPage director={director} onLogout={onLogout} />;
}

function App() {
  return (
    <AdminProvider>
      <PageStateProvider>
        <BrowserRouter>
          <div className="App min-h-screen bg-[var(--bg)]">
            <Routes>
              <Route path="/director" element={<DirectorPortal />} />
              <Route path="*" element={
                <>
                  <NavBar />
                  <Routes>
                    <Route path="/" element={<UploadPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/negative-feedback" element={<NegativeFeedbackPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                  </Routes>
                </>
              } />
            </Routes>
            <Toaster position="top-right" richColors closeButton />
          </div>
        </BrowserRouter>
      </PageStateProvider>
    </AdminProvider>
  );
}

export default App;