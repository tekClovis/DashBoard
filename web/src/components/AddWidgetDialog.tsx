import type { WidgetInstanceEntry, WidgetSpec } from '@dashboard/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useCatalog } from '@/api/catalog.js';
import { useCreateWidget, useUpdateWidget } from '@/api/widgets.js';
import { initialValues, ParamForm, toParams, validateParams, type ParamValues } from '@/components/ParamForm.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { DEFAULT_SIZE } from '@/lib/layout.js';

const MAX_REFRESH_SEC = 86400;

interface AddWidgetDialogProps {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Grid slot for a new instance (ignored when reconfiguring). */
  slot: { x: number; y: number };
  /** When set, the dialog reconfigures this instance and starts at the params step. */
  instance?: WidgetInstanceEntry;
}

export function AddWidgetDialog(props: AddWidgetDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* Keyed so each open starts from fresh state. */}
        {props.open && <DialogBody key={props.instance?.id ?? 'new'} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ dashboardId, onOpenChange, slot, instance }: AddWidgetDialogProps) {
  const { data: catalog, isError: catalogError } = useCatalog();
  const create = useCreateWidget(dashboardId);
  const update = useUpdateWidget(dashboardId);

  const firstStep = instance ? 2 : 1;
  const [step, setStep] = useState(firstStep);
  const [picked, setPicked] = useState<WidgetSpec | undefined>();
  const [values, setValues] = useState<ParamValues>({});
  const [refresh, setRefresh] = useState(instance ? String(instance.refreshRate) : '');

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

  const refreshNum = Number(refresh);
  const refreshError =
    spec && (!Number.isInteger(refreshNum) || refreshNum < spec.minRefreshSec || refreshNum > MAX_REFRESH_SEC)
      ? `Must be between ${spec.minRefreshSec} and ${MAX_REFRESH_SEC} seconds`
      : null;

  const mutation = instance ? update : create;
  function confirm() {
    if (!spec) return;
    const params = toParams(spec.params, values);
    const done = { onSuccess: () => onOpenChange(false) };
    if (instance) update.mutate({ id: instance.id, params, refreshRate: refreshNum }, done);
    else
      create.mutate(
        { service: spec.service, widget: spec.name, params, refreshRate: refreshNum, ...slot, ...DEFAULT_SIZE },
        done,
      );
  }

  const canNext = step === 1 ? !!picked : step === 2 ? !!spec && validateParams(spec.params, values) : !refreshError;

  return (
    <>
      <DialogTitle>{instance ? 'Configure widget' : 'Add widget'}</DialogTitle>
      <DialogDescription>Step {step} of 4</DialogDescription>

      {step === 1 && (
        <div className="grid gap-4">
          {catalog?.services.map((service) => {
            const connected = service.connection === 'none' || service.connected;
            return (
              <div key={service.name} className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{service.name}</h3>
                  {!connected && (
                    <Link to="/services" className="text-primary text-sm underline">
                      Connect
                    </Link>
                  )}
                </div>
                {service.widgets.map((w) => (
                  <button
                    key={w.name}
                    type="button"
                    disabled={!connected}
                    aria-pressed={picked === w}
                    onClick={() => setPicked(w)}
                    className="hover:bg-accent focus-visible:ring-ring/50 aria-pressed:border-primary rounded-md border p-2 text-left text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50"
                  >
                    <span className="font-medium">{w.name}</span>
                    <span className="text-muted-foreground block">{w.description}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {step > 1 && !spec && (
        <p role={catalogError ? 'alert' : 'status'} className="text-sm">
          {catalogError ? 'Could not load the widget catalog.' : 'Loading…'}
        </p>
      )}

      {step === 2 && spec && <ParamForm specs={spec.params} values={values} onChange={setValues} />}

      {step === 3 && spec && (
        <div className="grid gap-1.5">
          <Label htmlFor="refresh-rate">Refresh rate (seconds)</Label>
          <Input
            id="refresh-rate"
            type="number"
            min={spec.minRefreshSec}
            max={MAX_REFRESH_SEC}
            value={refresh}
            aria-invalid={refreshError !== null}
            onChange={(e) => setRefresh(e.target.value)}
          />
          {refreshError && (
            <p role="alert" className="text-destructive text-sm">
              {refreshError}
            </p>
          )}
        </div>
      )}

      {step === 4 && spec && (
        <dl className="grid gap-1 text-sm">
          <dt className="font-medium">Widget</dt>
          <dd>
            {spec.service}.{spec.name}
          </dd>
          <dt className="font-medium">Parameters</dt>
          <dd>{JSON.stringify(toParams(spec.params, values))}</dd>
          <dt className="font-medium">Refresh rate</dt>
          <dd>{refreshNum}s</dd>
        </dl>
      )}

      {mutation.isError && (
        <p role="alert" className="text-destructive text-sm">
          Could not save the widget.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => (step === firstStep ? onOpenChange(false) : setStep(step - 1))}>
          {step === firstStep ? 'Cancel' : 'Back'}
        </Button>
        {step < 4 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button disabled={mutation.isPending} onClick={confirm}>
            {instance ? 'Save' : 'Add widget'}
          </Button>
        )}
      </div>
    </>
  );
}
