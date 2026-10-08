import * as React from "react";

import { App } from "./App";
import { DATASET_PAGE_SIZE, pagingStep } from "./dataverseData";
import type { IInputs, IOutputs } from "./generated/ManifestTypes";

function datasetFingerprint(
  dataset: ComponentFramework.PropertyTypes.DataSet | undefined,
): string {
  if (!dataset) {
    return "-";
  }
  return (
    dataset.columns.map((column) => column.alias).join("|") +
    "#" +
    dataset.sortedRecordIds.join(",")
  );
}

export class SchedulerControl
  implements ComponentFramework.ReactControl<IInputs, IOutputs>
{
  /** Row count at which the last next-page request went out; one request per page. */
  private requestedPageAt = -1;

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
  ): void {
    // The platform owns the viewport: the control renders into whatever
    // it is allocated (form section, subgrid, custom page region).
    context.mode.trackContainerResize(true);
    // The whole view, not the first page (see pagingStep).
    const paging = context.parameters.workItems?.paging;
    if (paging && paging.pageSize < DATASET_PAGE_SIZE) {
      paging.setPageSize(DATASET_PAGE_SIZE);
    }
  }

  public updateView(
    context: ComponentFramework.Context<IInputs>,
  ): React.ReactElement {
    const width = context.mode.allocatedWidth;
    const height = context.mode.allocatedHeight;
    /*
     * The context object is mutated in place between updateView calls,
     * so React cannot see data changes through it. The fingerprint is
     * the change signal: same bound rows and columns, same string.
     */
    const dataset = context.parameters.workItems;
    const fingerprint = datasetFingerprint(dataset);
    const loadedRows = dataset?.sortedRecordIds.length ?? 0;
    const step = pagingStep({
      hasNextPage: dataset?.paging?.hasNextPage ?? false,
      loadedRows,
      loading: dataset?.loading ?? false,
    });
    if (step.loadNextPage && this.requestedPageAt !== loadedRows) {
      this.requestedPageAt = loadedRows;
      dataset.paging.loadNextPage();
    }
    return React.createElement(
      "div",
      {
        style: {
          height: height > 0 ? `${height}px` : "100%",
          overflow: "hidden",
          width: width > 0 ? `${width}px` : "100%",
        },
      },
      React.createElement(App, {
        context,
        dataFingerprint: fingerprint,
        rowCapReached: step.capReached,
      }),
    );
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    // React unmount is handled by the platform for virtual controls.
  }
}
