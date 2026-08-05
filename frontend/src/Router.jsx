// router.jsx

import { Routes, Route } from "react-router-dom";
import App from "./App_new";
import AppProg from "./App_prog";

export default function Router() {
  return (
    <Routes>
      <Route path="/chords" element={<App />} />
      <Route path="/prog" element={<AppProg />} />
    </Routes>
  );
}