import { useEffect, useMemo, useState } from "react";
import { MALAYSIA_CITIES, MALAYSIA_CITY_MAP } from "../lib/malaysiaCities";
import type { BusinessInput, BusinessRecord, MaterialRef } from "../lib/types";

type ProjectWizardProps = {
  business?: BusinessRecord;
  isSaving: boolean;
  onSave: (
    value: BusinessInput,
    assets: {
      logoFile: File | null;
      materialFiles: File[];
    }
  ) => Promise<void>;
};

const STEPS = [
  { id: 0, label: "Identity" },
  { id: 1, label: "Materials" },
  { id: 2, label: "Location" }
] as const;

const EMPTY_FORM: BusinessInput = {
  name: "",
  logoUrl: "",
  logoPath: "",
  description: "",
  website: "",
  socialLinks: [],
  referenceLinks: [],
  city: MALAYSIA_CITIES[0].city,
  address: ""
};

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function materialLabel(material: MaterialRef | File) {
  if ("uploadedAt" in material) {
    return `${material.name} · ${Math.round(material.size / 1024)} KB`;
  }

  return `${material.name} · ${Math.round(material.size / 1024)} KB`;
}

export function ProjectWizard({ business, isSaving, onSave }: ProjectWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BusinessInput>(EMPTY_FORM);
  const [socialLinks, setSocialLinks] = useState("");
  const [referenceLinks, setReferenceLinks] = useState<string[]>([]);
  const [materialLinkDraft, setMaterialLinkDraft] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!business) {
      setForm(EMPTY_FORM);
      setSocialLinks("");
      setReferenceLinks([]);
      setMaterialLinkDraft("");
      setLogoFile(null);
      setMaterialFiles([]);
      setStep(0);
      setError(null);
      return;
    }

    setForm({
      name: business.name,
      logoUrl: business.logoUrl,
      logoPath: business.logoPath,
      description: business.description,
      website: business.website,
      socialLinks: business.socialLinks,
      referenceLinks: business.referenceLinks,
      city: business.city,
      address: business.address
    });
    setSocialLinks(business.socialLinks.join("\n"));
    setReferenceLinks(business.referenceLinks);
    setMaterialLinkDraft("");
    setLogoFile(null);
    setMaterialFiles([]);
    setError(null);
  }, [business]);

  const logoPreview = useMemo(() => {
    if (logoFile) {
      return URL.createObjectURL(logoFile);
    }

    return form.logoUrl;
  }, [form.logoUrl, logoFile]);

  useEffect(() => {
    return () => {
      if (logoFile) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoFile, logoPreview]);

  const cityProfile = MALAYSIA_CITY_MAP.get(form.city);

  function validateCurrentStep() {
    if (step === 0 && (!form.name.trim() || !form.description.trim())) {
      setError("Project name and description are required.");
      return false;
    }

    if (step === 2 && (!form.city.trim() || !form.address.trim())) {
      setError("City and address are required.");
      return false;
    }

    setError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateCurrentStep()) {
      return;
    }

    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    await onSave(
      {
        ...form,
        socialLinks: linesToArray(socialLinks),
        referenceLinks
      },
      {
        logoFile,
        materialFiles
      }
    );
  }

  function handleAddMaterialLink() {
    const normalized = materialLinkDraft.trim();
    if (!normalized) {
      return;
    }

    setReferenceLinks((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setMaterialLinkDraft("");
  }

  return (
    <form className="panel wizard-panel" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project Builder</p>
          <h2>{business ? "Update project" : "Create a new project"}</h2>
        </div>
        <div className="step-row">
          {STEPS.map((entry) => (
            <button
              className={`step-pill ${entry.id === step ? "active" : ""}`}
              key={entry.id}
              onClick={() => setStep(entry.id)}
              type="button"
            >
              {entry.id + 1}. {entry.label}
            </button>
          ))}
        </div>
      </div>

      {step === 0 ? (
        <div className="wizard-grid">
          <div className="logo-card">
            {logoPreview ? <img alt={form.name || "Project logo"} src={logoPreview} /> : <span>No logo yet</span>}
            <label className="upload-button">
              <input
                accept="image/*"
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              {logoFile ? "Replace logo" : "Upload logo"}
            </label>
          </div>

          <div className="wizard-fields">
            <label>
              <span>Project name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Maju Cafe Downtown"
              />
            </label>

            <label>
              <span>Description</span>
              <textarea
                required
                rows={7}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Describe what this SME does, what customers buy, what seasonality matters, and what operations need attention."
              />
            </label>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="wizard-grid wizard-grid-wide">
          <div className="wizard-fields">
            <label>
              <span>Website</span>
              <input
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                placeholder="https://example.com"
              />
            </label>

            <label>
              <span>Social links</span>
              <textarea
                rows={4}
                value={socialLinks}
                onChange={(event) => setSocialLinks(event.target.value)}
                placeholder="One URL per line"
              />
            </label>

            <label>
              <span>Material link</span>
              <div className="inline-input-row">
                <input
                  value={materialLinkDraft}
                  onChange={(event) => setMaterialLinkDraft(event.target.value)}
                  placeholder="https://docs.example.com/menu or catalog page"
                />
                <button className="ghost-button" onClick={handleAddMaterialLink} type="button">
                  Attach link
                </button>
              </div>
            </label>

            <div className="link-chip-list">
              {referenceLinks.map((link) => (
                <article className="link-chip" key={link}>
                  <span>{link}</span>
                  <button
                    className="chip-remove"
                    onClick={() => setReferenceLinks((current) => current.filter((entry) => entry !== link))}
                    type="button"
                  >
                    Remove
                  </button>
                </article>
              ))}
              {!referenceLinks.length ? (
                <p className="muted">Attach public links for catalogs, menus, product pages, SOPs, FAQs, or docs.</p>
              ) : null}
            </div>
          </div>

          <div className="materials-stage">
            <div className="materials-heading">
              <div>
                <p className="eyebrow">Upload materials</p>
                <h3>Files for the AI assistant</h3>
              </div>
              <label className="upload-button">
                <input
                  multiple
                  onChange={(event) =>
                    setMaterialFiles((current) => [...current, ...Array.from(event.target.files ?? [])])
                  }
                  type="file"
                />
                Add files
              </label>
            </div>

            <div className="material-list">
              {materialFiles.map((file) => (
                <article className="material-card" key={`${file.name}-${file.lastModified}`}>
                  <strong>{materialLabel(file)}</strong>
                  <span>Queued for upload</span>
                </article>
              ))}
              {business?.materials.map((material) => (
                <article className="material-card" key={material.path}>
                  <strong>{materialLabel(material)}</strong>
                  <span>Already uploaded</span>
                </article>
              ))}
              {!materialFiles.length && !business?.materials.length ? (
                <p className="muted">Upload PDFs, docs, menus, catalogs, spreadsheets, and other business materials.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizard-grid">
          <div className="wizard-fields">
            <label>
              <span>City in Malaysia</span>
              <select
                value={form.city}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              >
                {MALAYSIA_CITIES.map((entry) => (
                  <option key={entry.city} value={entry.city}>
                    {entry.city}, {entry.state}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Address</span>
              <textarea
                required
                rows={4}
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="Lot, building, road, district"
              />
            </label>
          </div>

          {cityProfile ? (
            <div className="city-card wizard-city-card">
              <p className="eyebrow">Operating environment</p>
              <h3>
                {cityProfile.city}, {cityProfile.state}
              </h3>
              <p>{cityProfile.rainSummary}</p>
              <p>{cityProfile.floodSummary}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="wizard-actions">
        <button
          className="ghost-button"
          disabled={step === 0 || isSaving}
          onClick={() => setStep((current) => current - 1)}
          type="button"
        >
          Back
        </button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : step === STEPS.length - 1 ? "Save project" : "Continue"}
        </button>
      </div>
    </form>
  );
}
