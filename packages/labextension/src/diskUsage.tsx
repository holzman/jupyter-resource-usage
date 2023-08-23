// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { VDomModel, VDomRenderer } from '@jupyterlab/apputils';

import { URLExt } from '@jupyterlab/coreutils';

import { TextItem } from '@jupyterlab/statusbar';

import { ServerConnection } from '@jupyterlab/services';

import { TranslationBundle } from '@jupyterlab/translation';

import { Poll } from '@lumino/polling';

import React from 'react';

import { MemoryUnit, MEMORY_UNIT_LIMITS, convertToLargestUnit } from './format';

import { resourceItem } from './text';

/**
 * A VDomRenderer for showing disk usage by a kernel.
 */
export class DiskUsage extends VDomRenderer<DiskUsage.Model> {
  /**
   * Construct a new disk usage status item.
   */
  constructor(trans: TranslationBundle) {
    super(new DiskUsage.Model({ refreshRate: 5000 }));
    this._trans = trans;
  }

  /**
   * Render the disk usage status item.
   */
  render(): JSX.Element {
    if ((!this.model) || (this.model.diskTotal === null)) {
      return <div></div>;
    }
    let text: string;
    text = this._trans.__(
      'Disk Usage: %1 / %2 %3',
      this.model.diskUsed.toFixed(Private.DECIMAL_PLACES),
      this.model.diskTotal.toFixed(Private.DECIMAL_PLACES),
      this.model.units
    );

    if (!this.model.usageWarning) {
      return (
        <TextItem title={this._trans.__('Current disk usage')} source={text} />
      );
    } else {
      return (
        <TextItem
          title={this._trans.__('Current disk usage')}
          source={text}
          className={resourceItem}
        />
      );
    }
  }

  private _trans: TranslationBundle;
}

/**
 * A namespace for DiskUsage statics.
 */
export namespace DiskUsage {
  /**
   * A VDomModel for the disk usage status item.
   */
  export class Model extends VDomModel {
    /**
     * Construct a new disk usage model.
     *
     * @param options: the options for creating the model.
     */
    constructor(options: Model.IOptions) {
      super();
      this._poll = new Poll<Private.IMetricRequestResult>({
        factory: () => Private.factory(),
        frequency: {
          interval: options.refreshRate,
          backoff: true,
        },
        name: '@jupyterlab/statusbar:DiskUsage#metrics',
      });
      this._poll.ticked.connect((poll) => {
        const { payload, phase } = poll.state;
        if (phase === 'resolved') {
          this._updateMetricsValues(payload);
          return;
        }
        if (phase === 'rejected') {
          const oldMetricsAvailable = this._metricsAvailable;
          this._metricsAvailable = false;
          this._diskUsed = 0;
          this._diskTotal = null;
          this._units = 'B';

          if (oldMetricsAvailable) {
            this.stateChanged.emit();
          }
          return;
        }
      });
    }

    /**
     * Whether the metrics server extension is available.
     */
    get metricsAvailable(): boolean {
      return this._metricsAvailable;
    }

    /**
     * The current disk usage
     */
    get diskUsed(): number {
      return this._diskUsed;
    }

    /**
     * The current disk limit, or null if not specified.
     */
    get diskTotal(): number | null {
      return this._diskTotal;
    }

    /**
     * The units for disk usages and limits.
     */
    get units(): MemoryUnit {
      return this._units;
    }

    /**
     * The warning for disk usage.
     */
    get usageWarning(): boolean {
      return this._warn;
    }

    /**
     * Dispose of the memory usage model.
     */
    dispose(): void {
      super.dispose();
      this._poll.dispose();
    }

    /**
     * Given the results of the metrics request, update model values.
     */
    private _updateMetricsValues(
      value: Private.IMetricRequestResult | null
    ): void {
      const oldMetricsAvailable = this._metricsAvailable;
      const oldDiskUsed = this._diskUsed;
      const oldDiskTotal = this._diskTotal;
      const oldUnits = this._units;

      if ( (value === null) || (!value.hasOwnProperty('disk_used')) ){
        this._metricsAvailable = false;
        this._diskUsed = 0;
        this._diskTotal = null;
        this._units = 'B';
        this._warn = false;
      } else {
        const diskUsedBytes = value.disk_used;
        const diskTotal = value.disk_total;
        const [diskUsed, units] = convertToLargestUnit(diskUsedBytes);

        this._metricsAvailable = true;
        this._diskUsed = diskUsed;
        this._units = units;
        this._diskTotal = diskTotal
          ? diskTotal / MEMORY_UNIT_LIMITS[units]
          : null;
      }

      if (
        this._diskUsed !== oldDiskUsed ||
        this._units !== oldUnits ||
        this._diskTotal !== oldDiskTotal ||
        this._metricsAvailable !== oldMetricsAvailable
      ) {
        this.stateChanged.emit(void 0);
      }
    }

    private _diskUsed = 0;
    private _diskTotal: number | null = null;
    private _metricsAvailable = false;
    private _poll: Poll<Private.IMetricRequestResult>;
    private _units: MemoryUnit = 'B';
    private _warn = false;
  }

  /**
   * A namespace for Model statics.
   */
  export namespace Model {
    /**
     * Options for creating a DiskUsage model.
     */
    export interface IOptions {
      /**
       * The refresh rate (in ms) for querying the server.
       */
      refreshRate: number;
    }
  }
}

/**
 * A namespace for module private statics.
 */
namespace Private {
  /**
   * The number of decimal places to use when rendering disk usage.
   */
  export const DECIMAL_PLACES = 2;

  /**
   * Settings for making requests to the server.
   */
  const SERVER_CONNECTION_SETTINGS = ServerConnection.makeSettings();

  /**
   * The url endpoint for making requests to the server.
   */
  const METRIC_URL = URLExt.join(
    SERVER_CONNECTION_SETTINGS.baseUrl,
    'api/metrics/v1'
  );

  /**
   * The shape of a response from the metrics server extension.
   */
  export interface IMetricRequestResult {
    disk_used: number;
    disk_total: number;
  }

  /**
   * Make a request to the backend.
   */
  export async function factory(): Promise<IMetricRequestResult> {
    const request = ServerConnection.makeRequest(
      METRIC_URL,
      {},
      SERVER_CONNECTION_SETTINGS
    );
    const response = await request;

    return await response.json();
  }
}
