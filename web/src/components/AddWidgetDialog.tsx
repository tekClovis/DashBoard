import type { CatalogResponse, WidgetInstanceEntry, WidgetSpec } from '@dashboard/shared';
import { Ellipsis, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useCatalog } from '@/api/catalog.js';
import { useCreateWidget, useUpdateWidget } from '@/api/widgets.js';
import {
  FieldError,
  initialValues,
  ParamForm,
  toParams,
  validateParam,
  type ParamValues,
} from '@/components/ParamForm.js';
import { ViewSkeleton } from '@/components/WidgetFrame.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Lamp } from '@/components/ui/lamp.js';
import { DEFAULT_SIZE } from '@/lib/layout.js';
import { every, humanRefresh } from '@/lib/time.js';
import { cn } from '@/lib/utils.js';
import { getWidgetMeta } from '@/widgets/registry.js';

const MAX_REFRESH_SEC = 86400;
const STEPS = ['Widget', 'Settings', 'Refresh', 'Confirm'];
const PRESETS = [60, 300, 900, 3600];

interface AddWidgetDialogProps {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Grid slot for a new instance (ignored when reconfiguring). */
  slot: { x: number; y: number };
  /** When set, the dialog reconfigures this instance and starts at the params step. */
  instance?: WidgetInstanceEntry;
  /** Called with the new instance once it is created, before the dialog closes. */
  onCreated?: (instance: WidgetInstanceEntry) => void;
  /** Where focus goes when the dialog closes; preventDefault() to move it yourself. */
  onCloseAutoFocus?: (event: Event) => void;
}

export function AddWidgetDialog(props: AddWidgetDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        // Focus the opening step's first field once the focus trap is live, so the trap pulls
        // focus back when a closing widget menu returns it to its trigger.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          focusFirstField(e.currentTarget as HTMLElement);
        }}
        onCloseAutoFocus={props.onCloseAutoFocus}
        className="flex flex-col gap-0 overflow-hidden p-0 max-md:h-dvh max-md:max-h-dvh max-md:w-screen max-md:rounded-none max-md:border-0"
      >
        {/* Keyed so each open starts from fresh state. */}
        {props.open && <DialogBody key={props.instance?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ dashboardId, onOpenChange, slot, instance, onCreated }: AddWidgetDialogProps) {
  const { data: catalog, isError: catalogError } = useCatalog();
  const create = useCreateWidget(dashboardId);
  const update = useUpdateWidget(dashboardId);

  const firstStep = instance ? 2 : 1;
  const [step, setStep] = useState(firstStep);
  const [picked, setPicked] = useState<WidgetSpec | undefined>();
  const [values, setValues] = useState<ParamValues>({});
  const [refresh, setRefresh] = useState(instance ? String(instance.refreshRate) : '');
  // Errors show after a blocked Next (params) or once the field is left (refresh).
  const [showParamErrors, setShowParamErrors] = useState(false);
  const [refreshTouched, setRefreshTouched] = useState(false);
  const bodyRef = useRef<HTMLFormElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const spec =
    picked ??
    catalog?.services
      .find((s) => s.name === instance?.service)
      ?.widgets.find((w) => w.name === instance?.widget);

  // Prefill params once the spec is known (picked, or resolved from the catalog when reconfiguring).
  // Keyed by name, not object identity, so a catalog refetch doesn't wipe the user's edits.
  const specKey = spec && `${spec.service}.${spec.name}`;
  useEffect(() => {
    if (!spec) return;
    setValues(initialValues(spec.params, instance?.params));
    if (!instance) setRefresh(String(spec.minRefreshSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  // Each step opens on its first field (the picked card on step 1), the last on its primary action.
  // What is rendered on mount is focused by the dialog's open auto-focus instead.
  const ready = step === 1 ? !!catalog : !!spec;
  const focused = useRef({ step, ready });
  useEffect(() => {
    if (focused.current.step === step && focused.current.ready === ready) return;
    focused.current = { step, ready };
    if (step === 4) nextRef.current?.focus();
    else if (bodyRef.current) focusFirstField(bodyRef.current);
  }, [step, ready]);

  const refreshNum = Number(refresh);
  const refreshError =
    spec && (!Number.isInteger(refreshNum) || refreshNum < spec.minRefreshSec || refreshNum > MAX_REFRESH_SEC)
      ? `Enter ${spec.minRefreshSec} to ${MAX_REFRESH_SEC} seconds. This widget can’t refresh faster than every ${every(spec.minRefreshSec)}.`
      : null;
  const shownRefreshError = refreshTouched ? refreshError : null;

  const mutation = instance ? update : create;
  function confirm() {
    if (!spec) return;
    const params = toParams(spec.params, values);
    const close = () => onOpenChange(false);
    if (instance) update.mutate({ id: instance.id, params, refreshRate: refreshNum }, { onSuccess: close });
    else
      create.mutate(
        { service: spec.service, widget: spec.name, params, refreshRate: refreshNum, ...slot, ...DEFAULT_SIZE },
        {
          onSuccess: (created) => {
            onCreated?.(created);
            close();
          },
        },
      );
  }

  /** Advances unless the step is invalid, in which case it shows why and focuses the first invalid field. */
  function next() {
    if (!spec) {
      if (step === 1) bodyRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
      return;
    }
    if (step === 2) {
      const bad = spec.params.find((p) => validateParam(p, values[p.name] ?? ''));
      if (bad) {
        setShowParamErrors(true);
        document.getElementById(`param-${bad.name}`)?.focus();
        return;
      }
    }
    if (step === 3 && refreshError) {
      setRefreshTouched(true);
      document.getElementById('refresh-rate')?.focus();
      return;
    }
    if (step === 4) return confirm();
    setShowParamErrors(false);
    setStep(step + 1);
  }

  const meta = spec && getWidgetMeta(spec.service, spec.name);
  const widgetName = meta && `${meta.serviceLabel} › ${meta.label}`;

  return (
    <>
      <div className="grid gap-3 border-b px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-base font-semibold">{instance ? 'Configure widget' : 'Add widget'}</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
              {`Step ${step} of 4: ${STEPS[step - 1]}`}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X />
            </Button>
          </DialogClose>
        </div>
        <ol aria-label="Progress" className="grid grid-cols-4 gap-1">
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <li
                key={label}
                aria-current={n === step ? 'step' : undefined}
                className={cn(
                  "text-muted-foreground before:bg-border grid gap-1.5 text-xs before:h-0.5 before:rounded-[1px] before:content-['']",
                  n < step && 'before:bg-muted-foreground',
                  n === step && 'text-foreground before:bg-foreground font-[550]',
                )}
              >
                <span>
                  <span className="mr-1.5 font-mono">{n}</span>
                  <span className={cn(n !== step && 'max-md:hidden')}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <form
        ref={bodyRef}
        noValidate
        onSubmit={(e) => e.preventDefault()}
        className="grid flex-1 content-start gap-4 overflow-auto p-4"
      >
        {step === 1 &&
          catalog?.services.map((service) => {
            const connected = service.connection === 'none' || service.connected;
            // A service's glyph is its first widget's icon (cloud, commit, gamepad, play).
            const { serviceLabel, icon: ServiceIcon } = getWidgetMeta(service.name, service.widgets[0]?.name ?? '');
            return (
              <fieldset key={service.name} disabled={!connected} className="grid gap-2">
                <legend className="mb-2 flex w-full items-center gap-2 text-[0.8125rem] font-semibold">
                  <ServiceIcon aria-hidden className="text-muted-foreground size-3.5" />
                  {serviceLabel}
                  <ServiceState service={service} label={serviceLabel} />
                </legend>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5 max-md:grid-cols-1">
                  {service.widgets.map((w) => {
                    const key = `${w.service}.${w.name}`;
                    return (
                      <label
                        key={key}
                        className="hover:bg-accent has-checked:border-foreground has-focus-visible:outline-ring has-disabled:hover:bg-transparent grid cursor-pointer grid-cols-[16px_1fr] gap-x-2.5 gap-y-0.5 rounded-md border p-2.5 has-checked:shadow-[inset_0_0_0_1px_var(--foreground)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-disabled:cursor-not-allowed has-disabled:opacity-50"
                      >
                        <input
                          type="radio"
                          name="widget"
                          value={key}
                          disabled={!connected}
                          checked={specKey === key}
                          onChange={() => setPicked(w)}
                          className="accent-foreground row-span-3 mt-0.5 size-3.5 outline-none"
                        />
                        <span className="text-[0.8125rem] font-[550]">{getWidgetMeta(w.service, w.name).label}</span>
                        <span className="text-muted-foreground text-xs">{w.description}</span>
                        <span className="text-muted-foreground font-mono text-xs">{`refresh ≥ ${every(w.minRefreshSec)}`}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

        {(step === 1 ? !catalog : !spec) && (
          <p role={catalogError ? 'alert' : 'status'}>
            {catalogError ? 'Could not load the widget catalog.' : 'Loading…'}
          </p>
        )}

        {step === 2 && spec && (
          <>
            <p className="text-muted-foreground text-[0.8125rem]">{widgetName}</p>
            <ParamForm specs={spec.params} values={values} onChange={setValues} showErrors={showParamErrors} />
          </>
        )}

        {step === 3 && spec && (
          <div className="grid gap-1.5">
            <Label htmlFor="refresh-rate">Refresh every</Label>
            <span id="rr-hint" className="text-muted-foreground text-xs">
              {`Seconds, from ${spec.minRefreshSec} to ${MAX_REFRESH_SEC}. Each refresh uses the service’s API quota.`}
            </span>
            <div role="group" aria-label="Common intervals" className="flex flex-wrap gap-1.5">
              {PRESETS.filter((s) => s >= spec.minRefreshSec).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={refreshNum === s}
                  onClick={() => {
                    setRefresh(String(s));
                    setRefreshTouched(false);
                  }}
                  className="aria-pressed:bg-secondary aria-pressed:border-foreground"
                >
                  {every(s)}
                </Button>
              ))}
            </div>
            <div className="relative max-w-[180px]">
              <Input
                id="refresh-rate"
                type="number"
                inputMode="numeric"
                min={spec.minRefreshSec}
                max={MAX_REFRESH_SEC}
                value={refresh}
                aria-invalid={shownRefreshError ? true : undefined}
                aria-describedby={`rr-hint ${shownRefreshError ? 'rr-err' : 'rr-human'}`}
                onChange={(e) => setRefresh(e.target.value)}
                onBlur={() => setRefreshTouched(true)}
                className="pr-11 font-mono md:text-[0.8125rem]"
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-xs">
                sec
              </span>
            </div>
            {shownRefreshError ? (
              <FieldError id="rr-err">{shownRefreshError}</FieldError>
            ) : (
              <span id="rr-human" className="text-muted-foreground text-xs">
                {humanRefresh(refreshNum)}
              </span>
            )}
          </div>
        )}

        {step === 4 && spec && meta && (
          <>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-[0.8125rem]">
              <dt className="text-muted-foreground">Widget</dt>
              <dd>{widgetName}</dd>
              <dt className="text-muted-foreground">Settings</dt>
              <dd>
                {spec.params.length > 0 ? (
                  spec.params
                    .filter((p) => !p.hidden)
                    .map((p) => (
                      <span key={p.name} className="block font-mono text-xs">{`${p.name}=${values[p.name] ?? ''}`}</span>
                    ))
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Refresh</dt>
              <dd>
                <span className="font-mono text-xs">{`${refresh}s`}</span>{' '}
                <span className="text-muted-foreground">{`(${humanRefresh(refreshNum)})`}</span>
              </dd>
              {!instance && (
                <>
                  <dt className="text-muted-foreground">Placement</dt>
                  <dd className="text-muted-foreground">{`Bottom of the dashboard, ${DEFAULT_SIZE.w} columns wide`}</dd>
                </>
              )}
            </dl>
            <div>
              <p className="text-muted-foreground mb-1.5 text-xs">It will look like this until the first update arrives.</p>
              <WaitingPreview spec={spec} refreshRate={refreshNum} />
            </div>
          </>
        )}

        {mutation.isError && (
          <p role="alert" className="text-destructive">
            Could not save the widget.
          </p>
        )}
      </form>

      <div className="flex items-center gap-2 border-t px-4 py-3">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <span className="flex-1" />
        {step > firstStep && (
          <Button
            variant="outline"
            onClick={() => {
              setShowParamErrors(false);
              setStep(step - 1);
            }}
          >
            Back
          </Button>
        )}
        <Button ref={nextRef} disabled={step === 4 && mutation.isPending} onClick={next}>
          {step < 4 ? 'Next' : instance ? 'Save changes' : 'Add widget'}
        </Button>
      </div>
    </>
  );
}

/** Focuses a step's first field: the picked card on step 1, else the first enabled input or select. */
function focusFirstField(root: HTMLElement) {
  (root.querySelector<HTMLElement>('input:checked') ?? root.querySelector<HTMLElement>('input:not(:disabled), select'))?.focus();
}

type CatalogService = CatalogResponse['services'][number];

/** Connection badge in a service's legend; unconnected services also get a Connect link. */
function ServiceState({ service, label }: { service: CatalogService; label: string }) {
  if (service.connection === 'none')
    return (
      <Badge variant="success" className="ml-auto">
        <Lamp state="live" />
        No account needed
      </Badge>
    );
  if (!service.connected)
    return (
      <span className="ml-auto inline-flex items-center gap-2 font-medium">
        <Badge>
          <Lamp state="off" />
          Not connected
        </Badge>
        <Button asChild variant="link" className="text-xs">
          <Link to="/services">{`Connect ${label}`}</Link>
        </Button>
      </span>
    );
  if (service.status === 'REAUTH')
    return (
      <Badge variant="warning" className="ml-auto">
        <Lamp state="warn" />
        Reconnect needed
      </Badge>
    );
  return (
    <Badge variant="success" className="ml-auto">
      <Lamp state="live" />
      Connected
    </Badge>
  );
}

/** Static look of the new panel before its first push: the frame's header and loading skeleton. */
function WaitingPreview({ spec, refreshRate }: { spec: WidgetSpec; refreshRate: number }) {
  const { serviceLabel, label, icon: Icon } = getWidgetMeta(spec.service, spec.name);
  return (
    <div inert aria-hidden="true" className="bg-card h-[132px] overflow-hidden rounded-lg border">
      <div className="flex h-8 items-center gap-1.5 border-b px-2.5 text-xs">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
          <b className="font-semibold">{serviceLabel}</b>
          <span className="text-muted-foreground truncate">{label}</span>
        </span>
        <span className="text-muted-foreground flex items-center gap-2.5 font-mono whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <RefreshCw className="size-3.5" />
            {every(refreshRate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lamp state="waiting" />
            waiting
          </span>
        </span>
        <Ellipsis className="text-muted-foreground mx-1.5 size-4" />
      </div>
      <div className="flex flex-col gap-2.5 px-3 pt-2.5">
        <ViewSkeleton kind={`${spec.service}.${spec.name}`} />
      </div>
    </div>
  );
}
