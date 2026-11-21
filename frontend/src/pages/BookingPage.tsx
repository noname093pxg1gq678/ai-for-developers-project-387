import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Container,
  Group,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  createBooking,
  loadBookingSlots,
  loadMeetingTypes,
  PublicApiError,
} from "../data/publicApi";
import type { Meeting } from "../api";
import {
  bookingWindowDays,
  formatSlotTime,
  groupSlotsByDay,
} from "../lib/days";
import { formatDuration, formatMeetingDateTime } from "../lib/format";
import { useLoad } from "../lib/useLoad";

const BOOKING_PAGE_TITLE = "Запись на встречу";
const SLOTS_ERROR_MESSAGE = "Не удалось загрузить свободные слоты";
const TYPES_ERROR_MESSAGE = "Не удалось загрузить типы встреч";
const TYPE_NOT_FOUND_MESSAGE = "Тип встречи не найден";
const NO_SLOTS_MESSAGE = "На ближайшие 14 дней нет свободных слотов";
const BACK_LINK_LABEL = "Ко всем типам встреч";
const SUCCESS_TITLE = "Вы записаны";
const BOOKING_ERROR_MESSAGE = "Не удалось выполнить бронирование";

// Валидация формы зеркалит контракт и валидацию брони на бекенде (issue #12).
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface GuestForm {
  topic: string;
  guestName: string;
  guestEmail: string;
  comment: string;
}

interface GuestFormErrors {
  topic?: string;
  guestName?: string;
  guestEmail?: string;
  comment?: string;
}

function validateGuestForm(form: GuestForm): GuestFormErrors {
  const errors: GuestFormErrors = {};
  if (form.topic.trim().length === 0) {
    errors.topic = "Тема разговора обязательна";
  } else if (form.topic.length > 100) {
    errors.topic = "Тема разговора не может быть длиннее 100 символов";
  }
  if (form.guestName.trim().length === 0) {
    errors.guestName = "Имя гостя обязательно";
  } else if (form.guestName.length > 100) {
    errors.guestName = "Имя гостя не может быть длиннее 100 символов";
  }
  if (!EMAIL_PATTERN.test(form.guestEmail)) {
    errors.guestEmail = "Email гостя обязателен и должен быть корректным";
  }
  if (form.comment.length > 500) {
    errors.comment = "Комментарий не может быть длиннее 500 символов";
  }
  return errors;
}

// Поток записи (issue #11): шапка типа, календарь-полоса 14 дней с сегодня
// и сетка слотов выбранного дня в поясе владельца. Форма гостя, экран успеха
// и гонка 409 - issue #12. Свободные старты приходят одним запросом
// на всё окно и группируются по дням; дни без слотов и выходные неактивны.
export default function BookingPage() {
  const { typeId } = useParams();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [form, setForm] = useState<GuestForm>({
    topic: "",
    guestName: "",
    guestEmail: "",
    comment: "",
  });
  const [formErrors, setFormErrors] = useState<GuestFormErrors>({});
  const [booking, setBooking] = useState<Meeting | null>(null);
  const [raceMessage, setRaceMessage] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    document.title = BOOKING_PAGE_TITLE;
  }, []);

  const typesLoad = useLoad(loadMeetingTypes, []);
  const slotsLoad = useLoad(() => loadBookingSlots(typeId ?? ""), []);

  const meetingType =
    typesLoad.status === "ready"
      ? (typesLoad.data.find((type) => type.id === typeId) ?? null)
      : null;

  // Календарь-полоса от текущего дня; свободные старты группируются по дням.
  const days = bookingWindowDays();
  const slotsByDay = groupSlotsByDay(slotsLoad.data);
  const openDayKeys = days.filter(
    (day) => (slotsByDay.get(day.key) ?? []).length > 0,
  );
  const openDays = new Set(openDayKeys.map((day) => day.key));
  const activeDay =
    selectedDay && openDays.has(selectedDay)
      ? selectedDay
      : (openDayKeys[0]?.key ?? null);
  const daySlots = activeDay ? (slotsByDay.get(activeDay) ?? []) : [];

  async function submitBooking(): Promise<void> {
    const errors = validateGuestForm(form);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    if (!selectedSlot || !typeId) {
      return;
    }
    try {
      const meeting = await createBooking({
        typeId,
        startsAt: selectedSlot,
        topic: form.topic,
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        ...(form.comment.trim() === "" ? {} : { comment: form.comment }),
      });
      setBooking(meeting);
    } catch (error) {
      if (error instanceof PublicApiError && error.status === 409) {
        // Гонка: слот успели занять - сообщение возле сетки слотов,
        // сброс выбора и перезагрузка свободных стартов (issue #12).
        setSelectedSlot(null);
        setRaceMessage(error.message);
        slotsLoad.reload();
        return;
      }
      if (error instanceof PublicApiError && error.status === 404) {
        setBookingError(TYPE_NOT_FOUND_MESSAGE);
        return;
      }
      setBookingError(BOOKING_ERROR_MESSAGE);
    }
  }

  if (booking) {
    return (
      <Container size="sm" py="xl">
        <Title order={1} mb="md">
          {SUCCESS_TITLE}
        </Title>
        <Stack gap="xs" mb="xl">
          <Text size="lg" fw={600}>
            {booking.typeTitle}
          </Text>
          <Text>{formatMeetingDateTime(booking.startsAt)}</Text>
          <Text fw={600}>{booking.topic}</Text>
          <Text>{booking.guestName}</Text>
          {booking.comment && <Text c="dimmed">{booking.comment}</Text>}
        </Stack>
        <Button component={Link} to="/" variant="light">
          {BACK_LINK_LABEL}
        </Button>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Title order={1} mb="md">
        {BOOKING_PAGE_TITLE}
      </Title>

      {typesLoad.status === "loading" && (
        <Skeleton height={96} radius="md" mb="xl" />
      )}
      {typesLoad.status === "error" && (
        <Stack align="center" gap="sm" mb="xl">
          <Text c="red">{TYPES_ERROR_MESSAGE}</Text>
          <Button variant="light" onClick={typesLoad.reload}>
            Повторить
          </Button>
        </Stack>
      )}
      {typesLoad.status === "ready" && !meetingType && (
        <Text c="dimmed" mb="xl">
          {TYPE_NOT_FOUND_MESSAGE}
        </Text>
      )}

      {meetingType && (
        <Stack gap="xs" mb="xl">
          <Text size="lg" fw={600}>
            {meetingType.title}
          </Text>
          <Text c="dimmed">{meetingType.description}</Text>
          <Text size="sm" c="dimmed">
            {formatDuration(meetingType.durationMinutes)}
          </Text>
        </Stack>
      )}

      {meetingType && slotsLoad.status === "loading" && (
        <Skeleton height={120} radius="md" mb="xl" />
      )}
      {meetingType && slotsLoad.status === "error" && (
        <Stack align="center" gap="sm" mb="xl">
          <Text c="red">{SLOTS_ERROR_MESSAGE}</Text>
          <Button variant="light" onClick={slotsLoad.reload}>
            Повторить
          </Button>
        </Stack>
      )}

      {meetingType && slotsLoad.status === "ready" && (
        <>
          {/* Сообщение гонки - возле сетки слотов (issue #12). */}
          {raceMessage && (
            <Text c="red" mb="xs">
              {raceMessage}
            </Text>
          )}
          <Group gap="xs" mb="xl">
            {days.map((day) => (
              <Button
                key={day.key}
                size="compact-sm"
                variant={day.key === activeDay ? "light" : "default"}
                disabled={!openDays.has(day.key)}
                aria-pressed={day.key === activeDay}
                onClick={() => setSelectedDay(day.key)}
              >
                {day.label}
              </Button>
            ))}
          </Group>
          {daySlots.length === 0 ? (
            <Text c="dimmed" mb="xl">
              {NO_SLOTS_MESSAGE}
            </Text>
          ) : (
            <Group gap="xs" mb="xl">
              {daySlots.map((slot) => (
                <Button
                  key={slot}
                  size="compact-sm"
                  variant={slot === selectedSlot ? "light" : "default"}
                  aria-pressed={slot === selectedSlot}
                  onClick={() => {
                    setSelectedSlot(slot);
                    setRaceMessage(null);
                    setFormErrors({});
                  }}
                >
                  {formatSlotTime(slot)}
                </Button>
              ))}
            </Group>
          )}
        </>
      )}

      {bookingError && (
        <Text c="red" mb="xl">
          {bookingError}
        </Text>
      )}

      {meetingType && selectedSlot && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitBooking();
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Тема разговора"
              value={form.topic}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, topic: value }));
              }}
              error={formErrors.topic}
            />
            <TextInput
              label="Имя"
              value={form.guestName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, guestName: value }));
              }}
              error={formErrors.guestName}
            />
            <TextInput
              label="Email"
              value={form.guestEmail}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, guestEmail: value }));
              }}
              error={formErrors.guestEmail}
            />
            <Textarea
              label="Комментарий"
              value={form.comment}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, comment: value }));
              }}
              error={formErrors.comment}
            />
            <Button type="submit">Записаться</Button>
          </Stack>
        </form>
      )}

      <Button component={Link} to="/" variant="light" mt="md">
        {BACK_LINK_LABEL}
      </Button>
    </Container>
  );
}
