import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAgent, RequireAuth } from "./components/guards";
import { LoginPage } from "./pages/LoginPage";
import { AgentPickerPage } from "./pages/AgentPickerPage";
import { RubricListPage } from "./pages/RubricListPage";
import { CommittedRubricPage } from "./pages/CommittedRubricPage";
import { RubricEditorPage } from "./pages/RubricEditorPage";
import { RunsPage } from "./pages/RunsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";
import { ReviewDetailPage } from "./pages/ReviewDetailPage";

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
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:correlationId" element={<RunDetailPage />} />
            <Route path="/review" element={<ReviewQueuePage />} />
            <Route path="/review/:correlationId" element={<ReviewDetailPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/agents" replace />} />
      <Route path="*" element={<Navigate to="/agents" replace />} />
    </Routes>
  );
}
