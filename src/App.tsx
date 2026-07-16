import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAgent, RequireAuth } from "./components/guards";
import { LoginPage } from "./pages/LoginPage";
import { AgentPickerPage } from "./pages/AgentPickerPage";
import { RubricListPage } from "./pages/RubricListPage";
import { CommittedRubricPage } from "./pages/CommittedRubricPage";
import { RubricEditorPage } from "./pages/RubricEditorPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Everything below requires a session. */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/agents" element={<AgentPickerPage />} />

          {/* Everything below also requires a resolved agent. */}
          <Route element={<RequireAgent />}>
            <Route path="/rubrics" element={<RubricListPage />} />
            <Route path="/rubrics/committed/:type" element={<CommittedRubricPage />} />
            <Route path="/drafts/:id" element={<RubricEditorPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/agents" replace />} />
      <Route path="*" element={<Navigate to="/agents" replace />} />
    </Routes>
  );
}
