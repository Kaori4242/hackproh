import { useEffect, useState } from "react";
import { MALAYSIA_CITIES, MALAYSIA_CITY_MAP } from "../lib/malaysiaCities";
import type { BusinessInput, BusinessRecord } from "../lib/types";

type BusinessFormProps = {
  business?: BusinessRecord;
  onSave: (value: BusinessInput) => Promise<void>;
  isSaving: boolean;
};

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

function textBlockToLines(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function BusinessForm({ business, onSave, isSaving }: BusinessFormProps) {
  const [form, setForm] = useState<BusinessInput>(EMPTY_FORM);
  const [socialLinks, setSocialLinks] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");

  useEffect(() => {
    if (!business) {
      setForm(EMPTY_FORM);
      setSocialLinks("");
      setReferenceLinks("");
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
    setReferenceLinks(business.referenceLinks.join("\n"));
  }, [business]);

  const cityProfile = MALAYSIA_CITY_MAP.get(form.city);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      ...form,
      socialLinks: textBlockToLines(socialLinks),
      referenceLinks: textBlockToLines(referenceLinks)
    });
  }

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Business Workflow</p>
          <h2>{business ? "Update SME context" : "Create your SME profile"}</h2>
        </div>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : business ? "Save changes" : "Create business"}
        </button>
      </div>

      <div className="form-grid">
        <label>
          <span>Business name</span>
          <input
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Warung Maju Enterprise"
          />
        </label>

        <label>
          <span>Website</span>
          <input
            value={form.website}
            onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
            placeholder="https://example.com"
          />
        </label>

        <label className="full-span">
          <span>Business description</span>
          <textarea
            required
            rows={5}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="What the company sells, target audience, seasonality, operating concerns, and current goals."
          />
        </label>

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
          <span>Manual address</span>
          <input
            required
            value={form.address}
            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
            placeholder="Lot 12, Jalan Tun Razak..."
          />
        </label>

        <label className="full-span">
          <span>Social media links</span>
          <textarea
            rows={4}
            value={socialLinks}
            onChange={(event) => setSocialLinks(event.target.value)}
            placeholder="One URL per line"
          />
        </label>

        <label className="full-span">
          <span>Extra knowledge links</span>
          <textarea
            rows={4}
            value={referenceLinks}
            onChange={(event) => setReferenceLinks(event.target.value)}
            placeholder="Catalogs, supplier docs, menus, public FAQs, SOP pages"
          />
        </label>
      </div>

      {cityProfile ? (
        <div className="city-card">
          <div>
            <p className="eyebrow">City Climate Context</p>
            <h3>
              {cityProfile.city}, {cityProfile.state}
            </h3>
          </div>
          <p>{cityProfile.rainSummary}</p>
          <p>{cityProfile.floodSummary}</p>
        </div>
      ) : null}
    </form>
  );
}
