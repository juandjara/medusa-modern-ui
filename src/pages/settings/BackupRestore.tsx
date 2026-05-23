import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Archive,
  ChevronLeft,
  Download,
  Info,
  TriangleAlert,
  Upload,
} from "lucide-react";
import api from "../../lib/api";
import { pushToast } from "../../lib/toasts";
import FolderPicker from "../../components/forms/FolderPicker";
import ConfirmDialog from "../../components/ConfirmDialog";

// Backend round-trips through POST /api/v2/system/operation. Both ops take
// ~tens of seconds at minimum because they walk the data dir and compress
// it; bump the axios timeout from the default (system.py:182, 204).
const OP_TIMEOUT_MS = 180_000;

interface OperationResponse {
  result: string;
}

// Backend wraps result lines with literal "<br>\n" (system.py:179, 201);
// strip those for plaintext display in toasts and inline alerts.
function plainText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ");
}

export default function BackupRestore() {
  const [backupDir, setBackupDir] = useState("");
  const [backupFile, setBackupFile] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const backup = useMutation({
    mutationFn: () =>
      api
        .post<OperationResponse>(
          "/system/operation",
          { type: "BACKUPTOZIP", backupDir },
          { timeout: OP_TIMEOUT_MS },
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      const msg = plainText(data.result);
      const ok = msg.toLowerCase().startsWith("successful");
      pushToast({
        title: ok ? "Backup created" : "Backup didn't complete",
        body: msg,
        type: ok ? "notice" : "error",
      });
    },
    onError: () => {
      pushToast({
        title: "Backup failed",
        body: "Check the server logs. Operation may have timed out.",
        type: "error",
      });
    },
  });

  const restore = useMutation({
    mutationFn: () =>
      api
        .post<OperationResponse>(
          "/system/operation",
          { type: "RESTOREFROMZIP", backupFile },
          { timeout: OP_TIMEOUT_MS },
        )
        .then((r) => r.data),
    onSuccess: (data) => {
      const msg = plainText(data.result);
      const ok = msg.toLowerCase().startsWith("successfully");
      pushToast({
        title: ok ? "Restore staged" : "Restore didn't complete",
        body: msg,
        type: ok ? "notice" : "error",
      });
    },
    onError: () => {
      pushToast({
        title: "Restore failed",
        body: "Check the server logs. Operation may have timed out.",
        type: "error",
      });
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Backup &amp; restore</h1>
        <p className="text-sm text-base-content/60">
          Snapshot Medusa's database and config to a zip file, or stage a
          previous snapshot for restore. Backups always include{" "}
          <code>main.db</code> + <code>config.ini</code>; cache databases and
          the image cache are included only when the corresponding{" "}
          <em>Backup cache</em> flags are on in the server config.
        </p>
      </header>

      <div className="alert alert-soft alert-info text-xs items-start">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Paths on this page refer to the{" "}
          <strong>Medusa server's filesystem</strong>. The backup zip is written
          to that machine, and restore reads from it there. To keep a copy off
          the server, transfer the zip yourself (with SSH, network share, sync
          tool, etc.) after the backup completes.
        </span>
      </div>

      {/* Backup */}
      <section className="card bg-base-100 border-2 border-base-300 rounded-box">
        <header className="px-4 py-3 border-b border-base-300 flex items-center gap-2 font-semibold">
          <Archive size={16} /> Backup
        </header>
        <div className="card-body p-4 space-y-3">
          <p className="text-sm text-base-content/70">
            Pick a folder on the server's filesystem to write the backup zip
            into. The file is named{" "}
            <code>medusa-&lt;YYYYMMDDHHMMSS&gt;.zip</code>.
          </p>
          <FolderPicker
            value={backupDir}
            onChange={setBackupDir}
            placeholder="/path/to/backup/folder"
          />
          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="btn btn-sm btn-primary gap-1"
              disabled={!backupDir.trim() || backup.isPending}
              onClick={() => backup.mutate()}
            >
              {backup.isPending ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Backing up…
                </>
              ) : (
                <>
                  <Download size={14} /> Run backup
                </>
              )}
            </button>
          </div>
          {backup.data && (
            <div
              className={`alert alert-soft text-xs ${
                plainText(backup.data.result)
                  .toLowerCase()
                  .startsWith("successful")
                  ? "alert-success"
                  : "alert-warning"
              }`}
            >
              {plainText(backup.data.result)}
            </div>
          )}
        </div>
      </section>

      {/* Restore */}
      <section className="card bg-base-100 border-2 border-base-300 rounded-box">
        <header className="px-4 py-3 border-b border-base-300 flex items-center gap-2 font-semibold">
          <Upload size={16} /> Restore
        </header>
        <div className="card-body p-4 space-y-3">
          <p className="text-sm text-base-content/70">
            Pick a previous Medusa backup zip on the server's filesystem. Medusa
            extracts it into the data directory; the restore only takes effect
            after a restart.
          </p>
          <FolderPicker
            value={backupFile}
            onChange={setBackupFile}
            placeholder="/path/to/medusa-YYYYMMDDHHMMSS.zip"
            includeFiles
          />
          <div className="alert alert-soft alert-warning text-xs items-start">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              Restoring overwrites your current database and configuration.
              You'll need to <strong>restart Medusa</strong> for the change to
              take effect.
            </span>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="btn btn-sm btn-error gap-1"
              disabled={!backupFile.trim() || restore.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {restore.isPending ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  Restoring…
                </>
              ) : (
                <>
                  <Upload size={14} /> Run restore
                </>
              )}
            </button>
          </div>
          {restore.data && (
            <div
              className={`alert alert-soft text-xs ${
                plainText(restore.data.result)
                  .toLowerCase()
                  .startsWith("successfully")
                  ? "alert-success"
                  : "alert-warning"
              }`}
            >
              {plainText(restore.data.result)}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Restore from this backup?"
        body={
          <>
            <p>
              Medusa will extract <code>{backupFile}</code> into the data
              directory, overwriting <code>main.db</code> and{" "}
              <code>config.ini</code>.
            </p>
            <p className="mt-2">
              <strong>Restart Medusa</strong> after the extract completes to
              apply the restore.
            </p>
          </>
        }
        confirmLabel="Restore"
        variant="danger"
        onConfirm={() => {
          restore.mutate();
          setConfirmOpen(false);
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
