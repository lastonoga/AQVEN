import type { ComponentProps, CSSProperties, ReactElement, ReactNode } from "react"
import { createLink, type LinkComponent } from "@tanstack/react-router"
import { cn } from "cn"
import {
  columnsMinWidth,
  columnsTemplate,
  isGround,
  NO_PAINT,
  resolvePaint,
  rowsTemplate,
  type CellPaint,
  type CellSurface,
  type MatrixGround,
  type ResolvedPaint,
} from "./matrix-layout"
import { hasContent } from "./rich"
import { Text } from "./text"
import type { Tone } from "./tone"

export type { CellPaint, MatrixGround } from "./matrix-layout"
export { NO_PAINT } from "./matrix-layout"

export type MatrixRules = "grid" | "rows" | "columns"

type FieldBase = {
  readonly id: string
  readonly label?: ReactNode
  readonly sub?: ReactNode
  readonly emphasis?: boolean
  readonly verbatim?: boolean
  readonly ground?: MatrixGround
}

export type MatrixField<T> = FieldBase & {
  readonly kind?: "item"
  readonly track?: string
  readonly align?: "start" | "end"
  readonly render: (item: T, index: number) => ReactNode
  readonly paint?: (item: T) => CellPaint
  readonly onActivate?: (item: T) => void
  readonly isActivatable?: (item: T) => boolean
}

export type MatrixSpanField = FieldBase & {
  readonly kind: "span"
  readonly render: () => ReactNode
  readonly onActivate?: () => void
}

type MatrixCommon<T> = {
  readonly items: readonly T[]
  readonly itemKey: (item: T) => string
  readonly label: string
  readonly className?: string
}

export type RowsMatrixProps<T> = MatrixCommon<T> & {
  readonly orientation: "rows"
  readonly fields: readonly MatrixField<T>[]
  readonly rules?: MatrixRules
  readonly minWidth?: number
  readonly stickyHeader?: boolean
  readonly rowLink?: (item: T) => ReactElement
  readonly selected?: (item: T) => boolean
}

export type ColumnsMatrixProps<T> = MatrixCommon<T> & {
  readonly orientation: "columns"
  readonly fields: readonly (MatrixField<T> | MatrixSpanField)[]
  readonly minItemWidth: number
  readonly labelWidth?: number
  readonly itemPaint?: (item: T) => CellPaint
  readonly trailing?: (fieldId: string) => ReactNode
}

export type MatrixProps<T> = RowsMatrixProps<T> | ColumnsMatrixProps<T>

type TemplateHost = "root" | "row"

type RulesSpec = {
  readonly root: string
  readonly row: string
  readonly templateOn: TemplateHost
  readonly headRow: string
  readonly bodyRow: string
  readonly headCell: string
  readonly bodyPadding: string
  readonly paintsGround: boolean
}

type CellFrameProps = {
  readonly role: "cell" | "rowheader" | "columnheader"
  readonly paint: ResolvedPaint
  readonly padding: string
  readonly onActivate: (() => void) | undefined
  readonly className?: string
  readonly style?: CSSProperties
  readonly children: ReactNode
}

const DEFAULT_LABEL_WIDTH = 128
const SELECTED_PAINT: CellPaint = { surface: "neutral" }
const SPAN_COLUMN: CSSProperties = { gridColumn: "2 / -1" }

const ROW_CLASS = "relative grid"
const SUBGRID_ROW = "grid-cols-subgrid col-span-full"
const CELL_CLASS = "relative min-w-0 text-left"
const LINKED_CELL_CLASS = "[&_:is(a,button)]:relative [&_:is(a,button)]:z-1"
const STICKY_HEAD_CLASS = "sticky top-0 z-2"
const LABEL_CELL_CLASS = "sticky left-0 z-2 bg-muted"
const VALUE_PADDING = "px-2.5 py-2.25"
const ACTIVATE_CLASS =
  "flex h-full w-full flex-col items-stretch justify-start cursor-pointer text-left outline-none hover:inset-ring-2 hover:inset-ring-ring focus-visible:inset-ring-2 focus-visible:inset-ring-ring"
const ROW_LINK_CLASS =
  "absolute inset-0 z-0 outline-none hover:inset-ring-2 hover:inset-ring-ring focus-visible:inset-ring-2 focus-visible:inset-ring-ring"

const RULES: Readonly<Record<MatrixRules, RulesSpec>> = {
  grid: {
    root: "grid gap-px bg-border not-first:border-t not-first:border-border",
    row: SUBGRID_ROW,
    templateOn: "root",
    headRow: "bg-border",
    bodyRow: "",
    headCell: "bg-muted px-2.5 py-2",
    bodyPadding: VALUE_PADDING,
    paintsGround: true,
  },
  rows: {
    root: "flex flex-col divide-y divide-border bg-card",
    row: "",
    templateOn: "row",
    headRow: "grid gap-x-3.5 bg-muted px-3.5",
    bodyRow: "grid items-center gap-x-3.5 px-3.5",
    headCell: "py-2",
    bodyPadding: "py-3",
    paintsGround: false,
  },
  columns: {
    root: "grid gap-x-px bg-border",
    row: SUBGRID_ROW,
    templateOn: "root",
    headRow: "bg-border",
    bodyRow: "",
    headCell: "bg-muted px-2.5 py-1.25",
    bodyPadding: "px-2.5 py-1.25",
    paintsGround: true,
  },
}

type TemplateStyles = { readonly root: CSSProperties; readonly row: CSSProperties | undefined }

const TEMPLATE_STYLES: Readonly<Record<TemplateHost, (template: string, minWidth: number | undefined) => TemplateStyles>> = {
  root: (template, minWidth) => ({ root: { gridTemplateColumns: template, minWidth }, row: undefined }),
  row: (template, minWidth) => ({ root: { minWidth }, row: { gridTemplateColumns: template } }),
}

const GROUND_CLASS: Readonly<Record<MatrixGround | "none", string>> = {
  card: "bg-card",
  subtle: "bg-background-subtle",
  none: "",
}

const ALIGN_CLASS: Readonly<Record<"start" | "end", string>> = {
  start: "",
  end: "justify-end text-right",
}

const surfaceClass = (surface: CellSurface): string => (isGround(surface) ? GROUND_CLASS[surface] : "bg-tone-bg")

const surfaceTone = (surface: CellSurface): Tone | undefined => (isGround(surface) ? undefined : surface)

const itemActivation = <T,>(field: MatrixField<T>, item: T): (() => void) | undefined => {
  const { onActivate, isActivatable } = field
  if (onActivate === undefined) return undefined
  if (isActivatable?.(item) === false) return undefined
  return () => {
    onActivate(item)
  }
}

const isSpanField = <T,>(field: MatrixField<T> | MatrixSpanField): field is MatrixSpanField => field.kind === "span"

function RowAnchor({ className, ...props }: ComponentProps<"a">) {
  return <a {...props} className={cn(ROW_LINK_CLASS, className)} />
}

const LinkedRowAnchor = createLink(RowAnchor)

export const RowLink: LinkComponent<typeof RowAnchor> = (props) => <LinkedRowAnchor {...props} />

function CellAccent({ accent }: { readonly accent: Tone | undefined }) {
  if (accent === undefined) return null
  return <span aria-hidden data-tone={accent} className="absolute inset-y-0 left-0 w-0.5 bg-tone" />
}

function CellBody({ padding, onActivate, children }: Pick<CellFrameProps, "padding" | "onActivate" | "children">) {
  if (onActivate === undefined) return <>{children}</>
  return (
    <button type="button" onClick={onActivate} className={cn(ACTIVATE_CLASS, padding)}>
      {children}
    </button>
  )
}

function CellFrame({ role, paint, padding, onActivate, className, style, children }: CellFrameProps) {
  return (
    <div
      role={role}
      data-tone={surfaceTone(paint.surface)}
      style={style}
      className={cn(CELL_CLASS, surfaceClass(paint.surface), onActivate === undefined && padding, className)}
    >
      <CellAccent accent={paint.accent} />
      <CellBody padding={padding} onActivate={onActivate}>
        {children}
      </CellBody>
    </div>
  )
}

function FieldSub({ sub }: { readonly sub: ReactNode }) {
  if (!hasContent(sub)) return null
  return (
    <Text role="caption" tone="neutral" verbatim className="mt-1.25 block">
      {sub}
    </Text>
  )
}

type HeadRowProps<T> = {
  readonly fields: readonly MatrixField<T>[]
  readonly spec: RulesSpec
  readonly sticky: boolean
  readonly style: CSSProperties | undefined
}

function HeadRow<T>({ fields, spec, sticky, style }: HeadRowProps<T>) {
  return (
    <div role="row" style={style} className={cn(ROW_CLASS, spec.row, spec.headRow, sticky && STICKY_HEAD_CLASS)}>
      {fields.map((field) => (
        <div key={field.id} role="columnheader" className={cn(CELL_CLASS, spec.headCell, ALIGN_CLASS[field.align ?? "start"])}>
          <Text as="div" role="column" tone="neutral" verbatim={field.verbatim ?? false}>
            {field.label}
          </Text>
          <FieldSub sub={field.sub} />
        </div>
      ))}
    </div>
  )
}

type BodyRowProps<T> = {
  readonly item: T
  readonly index: number
  readonly fields: readonly MatrixField<T>[]
  readonly spec: RulesSpec
  readonly rowLink: ((item: T) => ReactElement) | undefined
  readonly selected: ((item: T) => boolean) | undefined
  readonly style: CSSProperties | undefined
}

function BodyRow<T>({ item, index, fields, spec, rowLink, selected, style }: BodyRowProps<T>) {
  const isSelected = selected?.(item) === true
  const itemPaint = isSelected ? SELECTED_PAINT : NO_PAINT
  const link = rowLink?.(item)
  const linked = link !== undefined
  return (
    <div role="row" aria-current={isSelected ? "true" : undefined} style={style} className={cn(ROW_CLASS, spec.row, spec.bodyRow)}>
      {fields.map((field) => (
        <CellFrame
          key={field.id}
          role="cell"
          paint={resolvePaint(spec.paintsGround ? (field.ground ?? "card") : "none", itemPaint, field.paint?.(item) ?? NO_PAINT)}
          padding={spec.bodyPadding}
          onActivate={itemActivation(field, item)}
          className={cn(ALIGN_CLASS[field.align ?? "start"], linked && LINKED_CELL_CLASS)}
        >
          {field.render(item, index)}
        </CellFrame>
      ))}
      {link}
    </div>
  )
}

function RowsMatrix<T>({
  items,
  itemKey,
  label,
  className,
  fields,
  rules = "grid",
  minWidth,
  stickyHeader = false,
  rowLink,
  selected,
}: RowsMatrixProps<T>) {
  const spec = RULES[rules]
  const styles = TEMPLATE_STYLES[spec.templateOn](rowsTemplate(fields.map((field) => field.track)), minWidth)
  return (
    <div role="table" aria-label={label} className={cn(spec.root, className)} style={styles.root}>
      <HeadRow fields={fields} spec={spec} sticky={stickyHeader} style={styles.row} />
      {items.map((item, index) => (
        <BodyRow
          key={itemKey(item)}
          item={item}
          index={index}
          fields={fields}
          spec={spec}
          rowLink={rowLink}
          selected={selected}
          style={styles.row}
        />
      ))}
    </div>
  )
}

function LabelCell({ field }: { readonly field: FieldBase }) {
  const emphasis = field.emphasis ?? false
  return (
    <div role="rowheader" className={cn(LABEL_CELL_CLASS, VALUE_PADDING)}>
      <Text as="div" role="row" tone={emphasis ? "default" : "neutral"} weight={emphasis ? "semibold" : "medium"}>
        {field.label}
      </Text>
      <FieldSub sub={field.sub} />
    </div>
  )
}

type FieldValuesProps<T> = {
  readonly field: MatrixField<T> | MatrixSpanField
  readonly items: readonly T[]
  readonly itemKey: (item: T) => string
  readonly itemPaint: ((item: T) => CellPaint) | undefined
  readonly trailing: ((fieldId: string) => ReactNode) | undefined
}

function TrailingCell({ fieldId, trailing }: { readonly fieldId: string; readonly trailing: ((fieldId: string) => ReactNode) | undefined }) {
  if (trailing === undefined) return null
  return (
    <div role="cell" className={cn(CELL_CLASS, "bg-muted", VALUE_PADDING)}>
      {trailing(fieldId)}
    </div>
  )
}

function FieldValues<T>({ field, items, itemKey, itemPaint, trailing }: FieldValuesProps<T>) {
  if (isSpanField(field)) {
    return (
      <CellFrame role="cell" paint={resolvePaint(field.ground ?? "card", NO_PAINT, NO_PAINT)} padding={VALUE_PADDING} onActivate={field.onActivate} style={SPAN_COLUMN}>
        {field.render()}
      </CellFrame>
    )
  }
  const ground = field.ground ?? "card"
  return (
    <>
      {items.map((item, index) => (
        <CellFrame
          key={itemKey(item)}
          role="cell"
          paint={resolvePaint(ground, itemPaint?.(item) ?? NO_PAINT, field.paint?.(item) ?? NO_PAINT)}
          padding={VALUE_PADDING}
          onActivate={itemActivation(field, item)}
          className={ALIGN_CLASS[field.align ?? "start"]}
        >
          {field.render(item, index)}
        </CellFrame>
      ))}
      <TrailingCell fieldId={field.id} trailing={trailing} />
    </>
  )
}

function ColumnsMatrix<T>({
  items,
  itemKey,
  label,
  className,
  fields,
  minItemWidth,
  labelWidth = DEFAULT_LABEL_WIDTH,
  itemPaint,
  trailing,
}: ColumnsMatrixProps<T>) {
  const hasTrailing = trailing !== undefined
  return (
    <div
      role="table"
      aria-label={label}
      className={cn(RULES.grid.root, className)}
      style={{
        gridTemplateColumns: columnsTemplate(labelWidth, items.length, minItemWidth, hasTrailing),
        minWidth: columnsMinWidth(labelWidth, items.length, minItemWidth, hasTrailing),
      }}
    >
      {fields.map((field) => (
        <div key={field.id} role="row" className={cn(ROW_CLASS, RULES.grid.row)}>
          <LabelCell field={field} />
          <FieldValues field={field} items={items} itemKey={itemKey} itemPaint={itemPaint} trailing={trailing} />
        </div>
      ))}
    </div>
  )
}

export function Matrix<T>(props: MatrixProps<T>) {
  if (props.orientation === "rows") return <RowsMatrix {...props} />
  return <ColumnsMatrix {...props} />
}
