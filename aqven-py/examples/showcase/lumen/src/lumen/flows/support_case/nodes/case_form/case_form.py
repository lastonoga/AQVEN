from collections.abc import Mapping
from typing import Final

from aqven.spec import FieldSpec
from lumen.types import CaseIntent, SupportCaseCaseFormOut

ORDER_ID_FIELD: Final = FieldSpec(name="order_id", type="OrderId", description="Номер заказа Lumen")

INTENT_FIELDS: Final[Mapping[CaseIntent, tuple[FieldSpec, ...]]] = {
    "defect": (
        ORDER_ID_FIELD,
        FieldSpec(name="symptom", type="DefectSymptom", description="Главный симптом дефекта"),
        FieldSpec(name="purchased_on", type="Date?", description="Дата покупки по счёту; null, если её нет"),
        FieldSpec(name="safety_risk", type="Bool", description="Есть ли риск для безопасности: перегрев, гарь, искры"),
    ),
    "delivery": (
        ORDER_ID_FIELD,
        FieldSpec(name="damage", type="DeliveryDamage", description="Что случилось с заказом при доставке"),
        FieldSpec(
            name="carrier_ref",
            type="Text?",
            description="Номер отправления у перевозчика; null, если его нет",
            maxLength=40,
        ),
    ),
    "question": (
        FieldSpec(name="topic", type="Text", description="Тема вопроса покупателя", maxLength=200),
        FieldSpec(name="order_id", type="OrderId?", description="Номер заказа Lumen; null, если вопрос не о заказе"),
    ),
}


def case_form(intent: CaseIntent) -> SupportCaseCaseFormOut:
    kind = FieldSpec(name="kind", type="Text", description="Вид обращения", enum=[intent])
    return SupportCaseCaseFormOut(fields=[kind, *INTENT_FIELDS[intent]])
