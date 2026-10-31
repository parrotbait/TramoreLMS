// Created by Claude driven by Eddie Long on 2026-10-31.

import { PickScreen } from '@/components/PickScreen'
import { formatEuro } from '@/lib/format'
import { getPreview, viewContextOf, YOU } from '@/preview/store'
import { buildPickScreen } from '@/view-models/pick-screen'

import { previewBuyBack, previewPick } from '../actions'

const BUYBACK_CENTS = 500

export default async function PreviewPickPage() {
    const session = await getPreview()
    const model = buildPickScreen(viewContextOf(session), YOU, session.timeline.weekNumber)

    return (
        <PickScreen
            model={model}
            pickAction={previewPick}
            buybackAction={previewBuyBack}
            buybackFeeLabel={formatEuro(BUYBACK_CENTS)}
        />
    )
}
