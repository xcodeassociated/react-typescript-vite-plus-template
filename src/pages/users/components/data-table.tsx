import {
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  type TableOptions,
} from "@tanstack/react-table"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ReactTable } from "@tanstack/react-table"

export const features = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
})

export type DataTableColumns<TData extends RowData> = NonNullable<
  TableOptions<typeof features, TData>["columns"]
>

export interface DataTablePaginationProps<TData extends RowData> {
  table: ReactTable<typeof features, TData>
}

export function DataTablePagination<TData extends RowData>({
  table,
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Rows per page</span>
        <Select
          items={[5, 10, 20, 30, 40, 50].map((size) => ({
            value: `${size}`,
            label: `${size}`,
          }))}
          value={`${table.state.pagination.pageSize}`}
          onValueChange={(value: string | null) => {
            if (value !== null) {
              table.setPageSize(Number(value))
            }
          }}
        >
          <SelectTrigger size="sm" className="w-[70px]">
            <SelectValue placeholder={table.state.pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {[5, 10, 20, 30, 40, 50].map((pageSize) => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm font-medium">
        Page {table.state.pagination.pageIndex + 1} of {table.getPageCount()}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to first page</span>
          <ChevronsLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to last page</span>
          <ChevronsRightIcon />
        </Button>
      </div>
    </div>
  )
}

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumns<TData>
  data: TData[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  total,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
}: DataTableProps<TData>) {
  const table = useTable({
    features,
    columns,
    data,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
  })

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full min-w-0 rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {!header.isPlaceholder && (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
