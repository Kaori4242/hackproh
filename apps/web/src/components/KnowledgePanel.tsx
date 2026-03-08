import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { User } from "firebase/auth";
import { db, storage } from "../lib/firebase";
import type { BusinessRecord, MaterialRef } from "../lib/types";

type KnowledgePanelProps = {
  business?: BusinessRecord;
  user?: User | null;
  isIndexing: boolean;
  onIndexed: () => Promise<void>;
};

export function KnowledgePanel({
  business,
  user,
  isIndexing,
  onIndexed
}: KnowledgePanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!business || !user) {
    return (
      <section className="panel secondary-panel">
        <p className="eyebrow">Knowledge Base</p>
        <h2>Upload files after creating a business</h2>
        <p className="muted">
          Files and links are indexed into Gemini embeddings so the assistant can answer with your business context.
        </p>
      </section>
    );
  }

  const activeBusiness = business;
  const activeUser = user;

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const uploadedMaterials: MaterialRef[] = [];

      for (const file of files) {
        const path = `businesses/${activeUser.uid}/${activeBusiness.id}/materials/${Date.now()}-${file.name}`;
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file, {
          contentType: file.type
        });
        const downloadURL = await getDownloadURL(snapshot.ref);

        uploadedMaterials.push({
          name: file.name,
          path,
          downloadURL,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          uploadedAt: new Date().toISOString()
        });
      }

      await updateDoc(doc(db, "businesses", activeBusiness.id), {
        materials: [...activeBusiness.materials, ...uploadedMaterials],
        updatedAt: serverTimestamp()
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleReindex() {
    setError(null);

    try {
      await onIndexed();
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : "Indexing failed.");
    }
  }

  return (
    <section className="panel secondary-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Knowledge Base</p>
          <h2>Materials and indexing</h2>
        </div>
        <button
          className="secondary-button"
          disabled={isUploading || isIndexing}
          onClick={handleReindex}
          type="button"
        >
          {isIndexing ? "Indexing..." : "Run indexing"}
        </button>
      </div>

      <div className="upload-strip">
        <label className="upload-button">
          <input
            multiple
            onChange={handleUpload}
            type="file"
          />
          {isUploading ? "Uploading..." : "Upload files"}
        </label>
        <p className="muted">Best results: PDF, TXT, Markdown, CSV, HTML, JSON, and public links.</p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="material-list">
        {activeBusiness.materials.length ? (
          activeBusiness.materials.map((material) => (
            <article className="material-card" key={material.path}>
              <strong>{material.name}</strong>
              <span>{material.contentType}</span>
              <span>{Math.round(material.size / 1024)} KB</span>
            </article>
          ))
        ) : (
          <p className="muted">No materials uploaded yet.</p>
        )}
      </div>
    </section>
  );
}
