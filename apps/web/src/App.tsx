import { useEffect, useMemo, useState } from "react";
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
import { CHAT_API_URL } from "./lib/config";
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
  const [route, setRoute] = useState<RoutePath>(normalizeRoute(window.location.pathname));
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>("chat");

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

  async function handleSignOut() {
    await endSession();
    navigate("/");
  }

  if (route === "/") {
    return (
      <main className="marketing-shell">
        <header className="landing-nav">
          <div className="brand-lockup">
            <span className="brand-mark">SME</span>
            <strong>Copilot Malaysia</strong>
          </div>
          <div className="nav-actions">
            <button className="ghost-button" onClick={() => navigate("/auth")} type="button">
              Sign in
            </button>
            <button className="primary-button" onClick={() => navigate("/auth")} type="button">
              Start now
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">AI Copilot For Malaysian SMEs</p>
            <h1>Build a business-aware assistant with your files, your city, and live weather context.</h1>
            <p className="hero-copy">
              Launch a project, upload operating materials, map the business to a Malaysian city, and let Gemini 2.5
              Pro answer with business context, rain risk, flood risk, and live weather data.
            </p>
            <div className="hero-cta-row">
              <button className="primary-button" onClick={() => navigate("/auth")} type="button">
                Start now
              </button>
              <button className="ghost-button" onClick={() => navigate("/auth")} type="button">
                Sign in
              </button>
            </div>
          </div>

          <div className="landing-showcase panel">
            <div className="showcase-card">
              <p className="eyebrow">Weather-aware operations</p>
              <h3>Heavy rain in Kuala Lumpur? The assistant adjusts around it.</h3>
              <p>
                Use uploaded menus, SOPs, catalogs, staffing notes, and supplier docs together with city-level climate
                context and live Google Weather data.
              </p>
            </div>
            <div className="showcase-grid">
              <article className="stat-card">
                <span>3-step</span>
                <small>project creation flow</small>
              </article>
              <article className="stat-card">
                <span>Gemini</span>
                <small>embeddings + 2.5 Pro chat</small>
              </article>
              <article className="stat-card">
                <span>Cloud Run</span>
                <small>backend deployment</small>
              </article>
            </div>
          </div>
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
            <p className="eyebrow">Workspace</p>
            <p>{businesses.length ? `${businesses.length} active project(s)` : "No projects yet"}</p>
          </div>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-topbar">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1>
                {dashboardTab === "chat"
                  ? "AI workspace"
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
              <button className="ghost-button" onClick={handleSignOut} type="button">
                Sign out
              </button>
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
                  <section className="project-meta">
                    <h2>{selectedBusiness.name}</h2>
                    <span>{selectedBusiness.city || "No city set"}</span>
                    <span>{isIndexing ? "Syncing knowledge..." : `${selectedBusiness.materials.length} uploaded materials`}</span>
                    <span>{cityProfile?.rainSummary ?? "City context will appear after location is set."}</span>
                    <button className="ghost-button" onClick={() => setDashboardTab("chat")} type="button">
                      Open in chat
                    </button>
                  </section>
                ) : null}
              </section>
            </section>
          ) : null}

          {dashboardTab === "messenger" ? (
            <section className="dashboard-tab-content">
              <section className="panel integration-panel">
                <p className="eyebrow">Meta channels</p>
                <h2>Connect Facebook and Instagram messaging</h2>
                <p className="muted">
                  Keep customer chats synced to this workspace, then use AI to answer with your uploaded business context.
                </p>
                <label>
                  <span>Facebook Page ID</span>
                  <input placeholder="123456789012345" />
                </label>
                <label>
                  <span>Webhook verify token</span>
                  <input placeholder="your-secure-verify-token" />
                </label>
                <label>
                  <span>Messenger access token</span>
                  <input placeholder="EAAG..." />
                </label>
                <button className="primary-button" type="button">
                  Save integration
                </button>
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
