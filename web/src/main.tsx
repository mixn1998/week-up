import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import MilestoneUiSamplePage, { MilestoneWebPreviewPage } from "../app/milestone-ui-sample";
import "../app/globals.css";

const RootPage = window.location.pathname === "/milestone-ui-web" ? MilestoneWebPreviewPage : window.location.pathname === "/milestone-ui" ? MilestoneUiSamplePage : Home;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootPage />
  </StrictMode>,
);
