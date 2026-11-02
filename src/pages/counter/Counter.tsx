import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import {
  decrement,
  increment,
  incrementAsync,
  incrementByAmount,
  incrementIfOdd,
  selectCount,
} from "./counterSlice"

export function Counter() {
  const { t } = useTranslation("main")
  const count = useAppSelector(selectCount)
  const dispatch = useAppDispatch()
  const [incrementAmount, setIncrementAmount] = useState("2")

  const incrementValue = Number(incrementAmount) || 0

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>{t("counter.title")}</CardTitle>
        <CardDescription>{t("counter.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-6">
            <Button
              aria-label={t("counter.decrement")}
              onClick={() => dispatch(decrement())}
            >
              -
            </Button>
            <span className="min-w-16 text-center text-2xl font-semibold tabular-nums">
              {count}
            </span>
            <Button
              aria-label={t("counter.increment")}
              onClick={() => dispatch(increment())}
            >
              +
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Input
              className="w-24 text-center"
              aria-label={t("counter.increment_by")}
              value={incrementAmount}
              onChange={(e) => setIncrementAmount(e.target.value)}
            />
            <Button onClick={() => dispatch(incrementByAmount(incrementValue))}>
              {t("counter.add_amount")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => dispatch(incrementAsync(incrementValue))}
            >
              {t("counter.add_async")}
            </Button>
            <Button
              variant="outline"
              onClick={() => dispatch(incrementIfOdd(incrementValue))}
            >
              {t("counter.add_if_odd")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
