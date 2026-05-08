/**
 * next-intl test helper.
 *
 * Usage — wrap the element before passing to RTL render():
 *
 *   import { render } from "@testing-library/react"
 *   import { renderWithIntl } from "@/vitest.intl-helper"
 *
 *   render(renderWithIntl(<MyComponent />))
 *
 * Or compose with a custom renderWithIntl wrapper that calls render() internally:
 *
 *   function renderComponent(props: Props) {
 *     return render(renderWithIntl(<MyComponent {...props} />))
 *   }
 */
import { NextIntlClientProvider } from "next-intl"

import enMessages from "./messages/en.json"

import type { ReactNode } from "react"

export function renderWithIntl(children: ReactNode, locale = "en") {
  return (
    <NextIntlClientProvider locale={locale} messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  )
}
