import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCw,
  RefreshCcw,
  ChevronDown,
  Pencil,
  Image as ImageIcon,
  Languages,
  Eraser,
  Trash2,
  Play,
  Pause,
  History,
  Settings as SettingsIcon,
} from 'lucide-react'
import type { Series } from '../types/medusa'
import type { MassUpdateAction } from '../lib/series-actions'
import ConfirmDialog from './ConfirmDialog'

interface ConfirmConfig {
  title: string
  body: ReactNode
  confirmLabel: string
  variant: 'normal' | 'danger'
}

const CONFIRMS: Partial<Record<MassUpdateAction, ConfirmConfig>> = {
  rename: {
    title: 'Rename episode files?',
    body: 'PyMedusa will rename files in this show\'s folder to match the configured naming pattern. Files on disk will change.',
    confirmLabel: 'Rename',
    variant: 'normal',
  },
  remove: {
    title: 'Remove show from Medusa?',
    body: (
      <>
        <p>PyMedusa will forget about this show.</p>
        <p>Episode files on disk are <strong>kept</strong>. You can re-add the show later to resume tracking.</p>
      </>
    ),
    confirmLabel: 'Remove',
    variant: 'danger',
  },
  delete: {
    title: 'Delete show and all files?',
    body: (
      <>
        <p>
          PyMedusa will remove this show <strong>and permanently delete</strong>{' '}
          every episode file from disk.
        </p>
        <p className="text-error">This cannot be undone.</p>
      </>
    ),
    confirmLabel: 'Delete forever',
    variant: 'danger',
  },
}

interface Props {
  series: Series
  isPending: boolean
  queued: MassUpdateAction | null
  onAction: (action: MassUpdateAction) => void
  onTogglePause: () => void
  isPausePending: boolean
}

export default function ShowActionsMenu({
  series,
  isPending,
  queued,
  onAction,
  onTogglePause,
  isPausePending,
}: Props) {
  const [confirming, setConfirming] = useState<MassUpdateAction | null>(null)

  const trigger = (action: MassUpdateAction) => {
    if (CONFIRMS[action]) {
      setConfirming(action)
    } else {
      onAction(action)
    }
  }

  const refreshIsActive = isPending || queued === 'update'

  return (
    <>
      <div className="join">
        <button
          className="btn btn-sm gap-2 join-item"
          onClick={() => onAction('update')}
          disabled={refreshIsActive}
          title="Re-fetch metadata from the indexer (TMDB/TVDB)"
        >
          <RefreshCw
            size={14}
            className={refreshIsActive ? 'animate-spin' : ''}
          />
          {queued === 'update' ? 'Refresh queued' : 'Refresh metadata'}
        </button>

        <div className="dropdown dropdown-end join-item">
          <button
            tabIndex={0}
            className="btn btn-sm"
            aria-label="More actions"
            disabled={isPending}
          >
            <ChevronDown size={14} />
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-lg border border-base-300 p-2 w-60 mt-1"
          >
            <li>
              <Link to={`/history?show=${series.id.slug}`}>
                <History size={14} /> View history
              </Link>
            </li>
            <li>
              <Link to={`/show/${series.id.slug}/settings`}>
                <SettingsIcon size={14} /> Edit settings
              </Link>
            </li>
            <div className="divider my-1" />
            <li>
              <button
                onClick={onTogglePause}
                disabled={isPausePending}
              >
                {series.config.paused ? (
                  <>
                    <Play size={14} /> Resume
                  </>
                ) : (
                  <>
                    <Pause size={14} /> Pause
                  </>
                )}
              </button>
            </li>
            <div className="divider my-1" />
            <li>
              <button onClick={() => trigger('rescan')}>
                <RefreshCcw size={14} /> Rescan files
              </button>
            </li>
            <li>
              <button onClick={() => trigger('rename')}>
                <Pencil size={14} /> Rename episodes
              </button>
            </li>
            <li>
              <button onClick={() => trigger('image')}>
                <ImageIcon size={14} /> Refresh artwork
              </button>
            </li>
            {series.config.subtitlesEnabled && (
              <li>
                <button onClick={() => trigger('subtitle')}>
                  <Languages size={14} /> Download subtitles
                </button>
              </li>
            )}
            <div className="divider my-1" />
            <li>
              <button
                onClick={() => trigger('remove')}
                className="text-error"
              >
                <Eraser size={14} /> Remove from Medusa
              </button>
            </li>
            <li>
              <button
                onClick={() => trigger('delete')}
                className="text-error"
              >
                <Trash2 size={14} /> Delete show & files
              </button>
            </li>
          </ul>
        </div>
      </div>

      {confirming && CONFIRMS[confirming] && (
        <ConfirmDialog
          open={true}
          title={CONFIRMS[confirming]!.title}
          body={CONFIRMS[confirming]!.body}
          confirmLabel={CONFIRMS[confirming]!.confirmLabel}
          variant={CONFIRMS[confirming]!.variant}
          onConfirm={() => {
            onAction(confirming)
            setConfirming(null)
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  )
}
