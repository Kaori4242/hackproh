import { useEffect, useMemo, useState } from "react";
import { CloudRain, MessageSquareQuote, MousePointerClick, ShieldCheck, Zap } from "lucide-react";
import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { ChatPanel } from "./components/ChatPanel";
import { ProjectWizard } from "./components/ProjectWizard";
import { CHAT_API_URL, TELEGRAM_API_URL } from "./lib/config";
import {
  db,
  endSession,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  storage,
  watchAuthState
} from "./lib/firebase";
import { MALAYSIA_CITY_MAP } from "./lib/malaysiaCities";
import type { BusinessInput, BusinessRecord, MaterialRef } from "./lib/types";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

function toBusinessRecord(id: string, value: Record<string, unknown>): BusinessRecord {
  return {
    id,
    ownerId: String(value.ownerId ?? ""),
    name: String(value.name ?? ""),
    logoUrl: String(value.logoUrl ?? ""),
    logoPath: String(value.logoPath ?? ""),
    description: String(value.description ?? ""),
    website: String(value.website ?? ""),
    socialLinks: Array.isArray(value.socialLinks) ? value.socialLinks.map(String) : [],
    referenceLinks: Array.isArray(value.referenceLinks) ? value.referenceLinks.map(String) : [],
    city: String(value.city ?? ""),
    address: String(value.address ?? ""),
    materials: Array.isArray(value.materials)
      ? value.materials.map((item) => {
        const material = item as Record<string, unknown>;
        return {
          name: String(material.name ?? ""),
          path: String(material.path ?? ""),
          downloadURL: String(material.downloadURL ?? ""),
          contentType: String(material.contentType ?? ""),
          size: Number(material.size ?? 0),
          uploadedAt: String(material.uploadedAt ?? "")
        };
      })
      : [],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

type RoutePath = "/" | "/auth" | "/dashboard";
type DashboardTab = "chat" | "projects" | "messenger" | "settings";

function normalizeRoute(pathname: string): RoutePath {
  if (pathname === "/auth") {
    return "/auth";
  }

  if (pathname === "/dashboard") {
    return "/dashboard";
  }

  return "/";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isUploadingMaterials, setIsUploadingMaterials] = useState(false);
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname));
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("chat");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramMaskedToken, setTelegramMaskedToken] = useState("");
  const [telegramBotUsername, setTelegramBotUsername] = useState("");
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);

  useEffect(() => {
    const syncRoute = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener("popstate", syncRoute);

    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    return watchAuthState((currentUser) => {
      setUser(currentUser);
      if (currentUser && route === "/auth") {
        navigate("/dashboard");
      }
    });
  }, [route]);

  useEffect(() => {
    if (!user) {
      setBusinesses([]);
      setSelectedId(null);
      return;
    }

    const businessQuery = query(
      collection(db, "businesses"),
      where("ownerId", "==", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(businessQuery, (snapshot) => {
      const nextBusinesses = snapshot.docs.map((entry) =>
        toBusinessRecord(entry.id, entry.data() as Record<string, unknown>)
      );

      setBusinesses(nextBusinesses);
      setSelectedId((current) => {
        if (current && nextBusinesses.some((business) => business.id === current)) {
          return current;
        }

        return nextBusinesses[0]?.id ?? null;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.id === selectedId),
    [businesses, selectedId]
  );

  const cityProfile = selectedBusiness ? MALAYSIA_CITY_MAP.get(selectedBusiness.city) : undefined;
  const activeWizardBusiness = isProjectModalOpen ? selectedBusiness : undefined;

  useEffect(() => {
    setTelegramBotToken("");
    if (dashboardTab !== "messenger") {
      return;
    }

    void loadTelegramIntegration(selectedBusiness?.id);
  }, [dashboardTab, selectedBusiness?.id, user]);

  function navigate(next: RoutePath) {
    window.history.pushState({}, "", next);
    setRoute(next);
  }

  function formatAuthError(error: unknown) {
    if (!(error instanceof Error)) {
      return "Could not authenticate.";
    }

    if (error.message.includes("auth/operation-not-allowed")) {
      return "This sign-in method is not enabled in Firebase Authentication. Enable Google or Email/Password in the Firebase console.";
    }

    if (error.message.includes("auth/admin-restricted-operation")) {
      return "This auth method is restricted in Firebase. Enable the required provider in Firebase Authentication > Sign-in method.";
    }

    if (error.message.includes("auth/popup-closed-by-user")) {
      return "Google sign-in was closed before completion.";
    }

    if (error.message.includes("auth/invalid-credential") || error.message.includes("auth/invalid-login-credentials")) {
      return "Invalid email or password.";
    }

    if (error.message.includes("auth/email-already-in-use")) {
      return "This email is already registered. Try signing in instead.";
    }

    if (error.message.includes("auth/weak-password")) {
      return "Password should be at least 6 characters.";
    }

    return error.message;
  }

  async function handleGoogleAuth() {
    setIsAuthBusy(true);
    setSaveError(null);

    try {
      await signInWithGoogle();
      navigate("/dashboard");
    } catch (error) {
      setSaveError(formatAuthError(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function handleEmailAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthBusy(true);
    setSaveError(null);

    try {
      if (authMode === "signin") {
        await signInWithEmail(authEmail.trim(), authPassword);
      } else {
        await signUpWithEmail(authEmail.trim(), authPassword);
      }
      navigate("/dashboard");
    } catch (error) {
      setSaveError(formatAuthError(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function uploadProjectAssets(
    ownerId: string,
    businessId: string,
    currentBusiness: BusinessRecord | undefined,
    assets: {
      logoFile: File | null;
      materialFiles: File[];
    }
  ) {
    const updates: Partial<BusinessRecord> & { updatedAt: unknown } = {
      updatedAt: serverTimestamp()
    };

    if (assets.logoFile) {
      const logoPath = `businesses/${ownerId}/${businessId}/branding/${Date.now()}-${assets.logoFile.name}`;
      const logoRef = ref(storage, logoPath);
      const logoSnapshot = await uploadBytes(logoRef, assets.logoFile, {
        contentType: assets.logoFile.type
      });
      updates.logoUrl = await getDownloadURL(logoSnapshot.ref);
      updates.logoPath = logoPath;
    }

    if (assets.materialFiles.length) {
      const uploadedMaterials: MaterialRef[] = [];

      for (const file of assets.materialFiles) {
        const path = `businesses/${ownerId}/${businessId}/materials/${Date.now()}-${file.name}`;
        const fileRef = ref(storage, path);
        const snapshot = await uploadBytes(fileRef, file, {
          contentType: file.type
        });

        uploadedMaterials.push({
          name: file.name,
          path,
          downloadURL: await getDownloadURL(snapshot.ref),
          contentType: file.type || "application/octet-stream",
          size: file.size,
          uploadedAt: new Date().toISOString()
        });
      }

      updates.materials = [...(currentBusiness?.materials ?? []), ...uploadedMaterials];
    }

    if (updates.logoPath || updates.materials) {
      await updateDoc(doc(db, "businesses", businessId), updates);
    }
  }

  async function handleSaveBusiness(
    value: BusinessInput,
    assets: {
      logoFile: File | null;
      materialFiles: File[];
    }
  ) {
    if (!user) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (selectedBusiness) {
        await updateDoc(doc(db, "businesses", selectedBusiness.id), {
          ...value,
          updatedAt: serverTimestamp()
        });
        await uploadProjectAssets(user.uid, selectedBusiness.id, selectedBusiness, assets);
        setSelectedId(selectedBusiness.id);
        await handleIndexing(selectedBusiness.id);
      } else {
        const reference = await addDoc(collection(db, "businesses"), {
          ...value,
          ownerId: user.uid,
          materials: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await uploadProjectAssets(user.uid, reference.id, undefined, assets);
        setSelectedId(reference.id);
        await handleIndexing(reference.id);
      }

      setIsProjectModalOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the business.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleIndexing(businessId = selectedBusiness?.id) {
    if (!user || !businessId) {
      return;
    }

    setIsIndexing(true);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${CHAT_API_URL}/api/businesses/${businessId}/reindex`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleUploadMaterialsForSelected(files: File[]) {
    if (!user || !selectedBusiness || !files.length) {
      return;
    }

    setIsUploadingMaterials(true);
    setSaveError(null);

    try {
      await uploadProjectAssets(user.uid, selectedBusiness.id, selectedBusiness, {
        logoFile: null,
        materialFiles: files
      });
      await handleIndexing(selectedBusiness.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not upload and index materials.";
      setSaveError(message);
    } finally {
      setIsUploadingMaterials(false);
    }
  }

  async function handleProjectMaterialFilesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (!files?.length) {
      return;
    }

    try {
      await handleUploadMaterialsForSelected(Array.from(files));
    } catch {
      // Error state is already set via saveError.
    }
  }

  async function loadTelegramIntegration(businessId = selectedBusiness?.id) {
    if (!user || !businessId) {
      setTelegramMaskedToken("");
      setTelegramBotUsername("");
      setTelegramStatus(null);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${TELEGRAM_API_URL}/api/integrations/telegram/${businessId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        configured: boolean;
        botUsername?: string;
        maskedToken?: string;
      };

      if (!payload.configured) {
        setTelegramMaskedToken("");
        setTelegramBotUsername("");
        setTelegramStatus("Telegram bot is not configured for this project yet.");
        return;
      }

      setTelegramMaskedToken(payload.maskedToken ?? "");
      setTelegramBotUsername(payload.botUsername ?? "");
      setTelegramStatus("Telegram bot is connected and will answer with full business context and indexed files.");
    } catch (error) {
      setTelegramStatus(error instanceof Error ? error.message : "Could not load Telegram integration.");
    }
  }

  async function handleSaveTelegramIntegration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedBusiness || !telegramBotToken.trim()) {
      return;
    }

    setIsSavingTelegram(true);
    setTelegramStatus(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${TELEGRAM_API_URL}/api/integrations/telegram`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          botToken: telegramBotToken.trim()
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        configured: boolean;
        botUsername?: string;
        maskedToken?: string;
        webhookUrl?: string;
      };

      setTelegramMaskedToken(payload.maskedToken ?? "");
      setTelegramBotUsername(payload.botUsername ?? "");
      setTelegramBotToken("");
      setTelegramStatus(
        `Telegram bot connected${payload.botUsername ? ` (@${payload.botUsername})` : ""}. Webhook is active and replies use full project context.`
      );
    } catch (error) {
      setTelegramStatus(error instanceof Error ? error.message : "Could not save Telegram integration.");
    } finally {
      setIsSavingTelegram(false);
    }
  }

  async function handleSignOut() {
    await endSession();
    navigate("/");
  }

  if (route === "/") {
    return (
      <main className="marketing-shell">
        <header className="landing-nav">
          <div className="brand-lockup">
            <span className="brand-mark">
              <Zap size={22} fill="currentColor" strokeWidth={1} />
            </span>
            <strong>Copilot Malaysia</strong>
          </div>
          <div className="nav-actions">
            <button className="ghost-button" onClick={() => navigate("/auth")} type="button">
              Sign in
            </button>
            <button className="primary-button cta-animate" onClick={() => navigate("/auth")} type="button">
              Get Started <MousePointerClick size={16} className="ml-1" />
            </button>
          </div>
        </header>

        <section className="landing-hero-center">
          <div className="hero-content">
            <p className="eyebrow fade-up">Built for Malaysian SMEs</p>
            <h1 className="fade-up stagger-1">
              Your Business Knowledge. <br />
              <span className="text-gradient">Powered by Local Context.</span>
            </h1>
            <p className="hero-copy fade-up stagger-2">
              Upload your operating materials, menus, and SOPs. Provide your local address.
              Get an instant AI assistant driven by Gemini 2.5 Pro that cross-references your files against live local weather and flood data.
            </p>
            <div className="hero-cta-row fade-up stagger-3">
              <button className="primary-button hero-cta" onClick={() => navigate("/auth")} type="button">
                Build your Copilot
              </button>
              <button className="ghost-button border-cta" onClick={() => navigate("/auth")} type="button">
                View Demo
              </button>
            </div>
          </div>
        </section>

        <section className="landing-bento fade-up stagger-4">
          <article className="bento-card col-span-2 primary-bento">
            <div className="bento-icon-wrapper">
              <CloudRain size={28} className="bento-icon" />
            </div>
            <h2>Weather & Climate Aware</h2>
            <p>Automatically fetches live Google Weather data for your specific Malaysian city to anticipate rain, floods, and operational bottlenecks before they happen.</p>
          </article>

          <article className="bento-card">
            <div className="bento-icon-wrapper">
              <MessageSquareQuote size={28} className="bento-icon" />
            </div>
            <h3>Gemini 2.5 Pro</h3>
            <p>State-of-the-art conversational AI grounded purely in your uploaded business documents.</p>
          </article>

          <article className="bento-card">
            <div className="bento-icon-wrapper">
              <ShieldCheck size={28} className="bento-icon" />
            </div>
            <h3>Private & Secure</h3>
            <p>Your PDFs, docs, and links are securely embedded into Google Cloud for isolation.</p>
          </article>

          <article className="bento-card col-span-2 secondary-bento">
            <div className="bento-row">
              <div className="bento-text">
                <h2>Omnichannel Ready</h2>
                <p>Connect natively to Telegram, WhatsApp, and Meta Messenger. Staff and customers get context-aware answers wherever they are—no dashboards required.</p>
              </div>
            </div>
          </article>
        </section>
      </main>
    );
  }

  if (route === "/auth" || !user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel panel">
          <p className="eyebrow">Authentication</p>
          <h1>Enter the SME workspace</h1>
          <p className="hero-copy">
            Start with a dedicated project dashboard, then go through name and logo, materials, and location setup.
          </p>
          {saveError ? <p className="error-text">{saveError}</p> : null}
          <button className="primary-button auth-google-button" disabled={isAuthBusy} onClick={handleGoogleAuth} type="button">
            {isAuthBusy ? "Please wait..." : "Continue with Google"}
          </button>
          <div className="auth-divider">
            <span>or use email</span>
          </div>
          <div className="auth-mode-switch">
            <button
              className={`step-pill ${authMode === "signin" ? "active" : ""}`}
              onClick={() => setAuthMode("signin")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`step-pill ${authMode === "signup" ? "active" : ""}`}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Create account
            </button>
          </div>
          <form className="auth-form" onSubmit={handleEmailAuth}>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                onChange={(event) => setAuthEmail(event.target.value)}
                type="email"
                value={authEmail}
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                value={authPassword}
                placeholder="At least 6 characters"
                required
              />
            </label>
            <button className="ghost-button auth-submit-button" disabled={isAuthBusy} type="submit">
              {isAuthBusy ? "Please wait..." : authMode === "signin" ? "Sign in with email" : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand">
            <span className="brand-mark">SME</span>
            <div>
              <p className="eyebrow">Workspace</p>
              <strong>Copilot Malaysia</strong>
            </div>
          </div>

          <nav className="sidebar-tabs">
            <button
              className={`sidebar-tab ${dashboardTab === "chat" ? "active" : ""}`}
              onClick={() => setDashboardTab("chat")}
              type="button"
            >
              Chat
            </button>
            <button
              className={`sidebar-tab ${dashboardTab === "projects" ? "active" : ""}`}
              onClick={() => setDashboardTab("projects")}
              type="button"
            >
              Projects
            </button>
            <button
              className={`sidebar-tab ${dashboardTab === "messenger" ? "active" : ""}`}
              onClick={() => setDashboardTab("messenger")}
              type="button"
            >
              Messenger integration
            </button>
            <button
              className={`sidebar-tab ${dashboardTab === "settings" ? "active" : ""}`}
              onClick={() => setDashboardTab("settings")}
              type="button"
            >
              Settings
            </button>
          </nav>

          <div className="sidebar-foot">
            <div>
              <p className="eyebrow">Workspace</p>
              <p>{businesses.length ? `${businesses.length} active project(s)` : "No projects yet"}</p>
            </div>
            <button className="ghost-button" onClick={handleSignOut} style={{ width: '100%', justifyContent: 'flex-start' }} type="button">
              Sign out
            </button>
          </div>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-topbar">
            <div>
              <h1>
                {dashboardTab === "chat"
                  ? "AI Assistant"
                  : dashboardTab === "projects"
                    ? "Projects"
                    : dashboardTab === "messenger"
                      ? "Messenger integration"
                      : "Settings"}
              </h1>
            </div>
            <div className="nav-actions">
              {dashboardTab === "projects" ? (
                <button
                  className="ghost-button"
                  onClick={() => {
                    setSelectedId(null);
                    setIsProjectModalOpen(true);
                  }}
                  type="button"
                >
                  New project
                </button>
              ) : null}
            </div>
          </header>

          {saveError ? <p className="error-text panel">{saveError}</p> : null}

          {dashboardTab === "chat" ? (
            <section className="chat-layout">
              <ChatPanel business={selectedBusiness} user={user} />
            </section>
          ) : null}

          {dashboardTab === "projects" ? (
            <section className="dashboard-tab-content">
              <section className="panel projects-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Project management</p>
                    <h2>Choose and manage project context</h2>
                  </div>
                  <div className="nav-actions">
                    {selectedBusiness ? (
                      <button className="ghost-button" onClick={() => setIsProjectModalOpen(true)} type="button">
                        Edit selected
                      </button>
                    ) : null}
                    <button
                      className="primary-button"
                      onClick={() => {
                        setSelectedId(null);
                        setIsProjectModalOpen(true);
                      }}
                      type="button"
                    >
                      New project
                    </button>
                  </div>
                </div>

                <div className="project-chip-row">
                  {businesses.map((business) => (
                    <button
                      className={`project-chip ${selectedId === business.id ? "active" : ""}`}
                      key={business.id}
                      onClick={() => setSelectedId(business.id)}
                      type="button"
                    >
                      {business.logoUrl ? <img alt={business.name} src={business.logoUrl} /> : <span>{business.name[0]}</span>}
                      <strong>{business.name}</strong>
                    </button>
                  ))}
                </div>

                {!businesses.length ? (
                  <p className="muted">
                    No projects yet. Create one and complete the 3-step flow so chat can use your business context.
                  </p>
                ) : null}

                {selectedBusiness ? (
                  <section className="project-info-panel">
                    <section className="project-meta">
                      <h2>{selectedBusiness.name}</h2>
                      <span>{selectedBusiness.city || "No city set"}</span>
                      <span>{isIndexing ? "Syncing knowledge..." : `${selectedBusiness.materials.length} uploaded materials`}</span>
                      <span>{cityProfile?.rainSummary ?? "City context will appear after location is set."}</span>
                    </section>

                    <section className="project-actions-row">
                      <label className={`upload-button ${isUploadingMaterials ? "is-busy" : ""}`}>
                        {isUploadingMaterials ? "Uploading..." : "Upload materials"}
                        <input
                          disabled={isUploadingMaterials || isIndexing}
                          multiple
                          onChange={handleProjectMaterialFilesChange}
                          type="file"
                        />
                      </label>
                      <button
                        className="ghost-button"
                        disabled={isUploadingMaterials || isIndexing}
                        onClick={() => handleIndexing(selectedBusiness.id)}
                        type="button"
                      >
                        {isIndexing ? "Indexing..." : "Reindex now"}
                      </button>
                      <button className="ghost-button" onClick={() => setDashboardTab("chat")} type="button">
                        Open in chat
                      </button>
                    </section>

                    <section className="project-details-grid">
                      <article className="material-card">
                        <p className="eyebrow">Description</p>
                        <p>{selectedBusiness.description || "No description added yet."}</p>
                      </article>
                      <article className="material-card">
                        <p className="eyebrow">Business location</p>
                        <p>{selectedBusiness.address || "No address added yet."}</p>
                      </article>
                      <article className="material-card">
                        <p className="eyebrow">Materials indexed</p>
                        {selectedBusiness.materials.length ? (
                          <ul className="material-name-list">
                            {selectedBusiness.materials.slice(0, 5).map((material) => (
                              <li key={material.path}>{material.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No files uploaded yet.</p>
                        )}
                      </article>
                    </section>
                  </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {dashboardTab === "messenger" ? (
            <section className="dashboard-tab-content">
              <section className="panel integration-panel">
                <p className="eyebrow">Telegram</p>
                <h2>Connect a Telegram bot for business consultation</h2>
                <p className="muted">
                  The bot answers clients with full project context: business profile, uploaded/indexed files, links, city context,
                  and weather context when asked.
                </p>

                {selectedBusiness ? (
                  <>
                    <section className="project-meta">
                      <h2>{selectedBusiness.name}</h2>
                      <span>{selectedBusiness.city || "No city set"}</span>
                      <span>{selectedBusiness.materials.length} indexed material(s)</span>
                    </section>

                    <form className="integration-form" onSubmit={handleSaveTelegramIntegration}>
                      <label>
                        <span>Telegram bot token</span>
                        <input
                          onChange={(event) => setTelegramBotToken(event.target.value)}
                          placeholder="123456789:AA..."
                          type="password"
                          value={telegramBotToken}
                        />
                      </label>

                      {telegramMaskedToken ? (
                        <p className="muted">
                          Configured token: <strong>{telegramMaskedToken}</strong>
                          {telegramBotUsername ? ` (${telegramBotUsername})` : ""}
                        </p>
                      ) : null}

                      <div className="nav-actions">
                        <button className="primary-button" disabled={isSavingTelegram || !telegramBotToken.trim()} type="submit">
                          {isSavingTelegram ? "Saving..." : "Save Telegram bot"}
                        </button>
                        <button
                          className="ghost-button"
                          disabled={isSavingTelegram}
                          onClick={() => void loadTelegramIntegration(selectedBusiness.id)}
                          type="button"
                        >
                          Refresh status
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <p className="muted">
                    Select a project in the Projects tab first, then connect its Telegram bot token here.
                  </p>
                )}

                {telegramStatus ? <p className="muted">{telegramStatus}</p> : null}
              </section>
            </section>
          ) : null}

          {dashboardTab === "settings" ? (
            <section className="dashboard-tab-content">
              <section className="panel settings-panel">
                <p className="eyebrow">Workspace settings</p>
                <h2>Assistant behavior and defaults</h2>
                <label>
                  <span>Default response language</span>
                  <select defaultValue="en">
                    <option value="en">English</option>
                    <option value="ms">Bahasa Melayu</option>
                  </select>
                </label>
                <label>
                  <span>Ops escalation email</span>
                  <input placeholder="ops@company.com" />
                </label>
                <label>
                  <span>Default city note</span>
                  <textarea
                    defaultValue="Prioritize weather and flood impacts in operational suggestions."
                    rows={4}
                  />
                </label>
                <button className="primary-button" type="button">
                  Save settings
                </button>
              </section>
            </section>
          ) : null}
        </section>
      </div>

      {isProjectModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsProjectModalOpen(false)}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <ProjectWizard
              business={activeWizardBusiness}
              isSaving={isSaving}
              onCancel={() => setIsProjectModalOpen(false)}
              onSave={handleSaveBusiness}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
