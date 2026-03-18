import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Admin from "./pages/Admin";
import Catalog from "./pages/Catalog";
import Home from "./pages/Home";

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route element={<Home />} path="/" />
        <Route element={<Catalog />} path="/catalog" />
        <Route element={<Admin />} path="/admin" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  );
}

