import { useState } from "react";
import {
  Button,
  Card,
  Container,
  Group,
  Modal,
  NumberInput,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import type { Meeting, MeetingType, MeetingTypeInput } from "../api";
import {
  PanelApiError,
  createPanelMeetingType,
  deletePanelMeetingType,
  loadPanelMeetingTypes,
  loadPanelMeetings,
  updatePanelMeetingType,
} from "../data/panelApi";
import { formatDuration, formatMeetingDateTime } from "../lib/format";
import { useLoad } from "../lib/useLoad";

type EditorState = { mode: "create" } | { mode: "edit"; target: MeetingType };

interface FormState {
  title: string;
  description: string;
  durationMinutes: string;
}

interface FormErrors {
  title?: string;
  description?: string;
  durationMinutes?: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  durationMinutes: "",
};

const SKELETON_CARDS = 3;

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};
  const title = form.title.trim();
  if (title.length === 0) {
    errors.title = "Укажите название";
  } else if (title.length > 100) {
    errors.title = "Название не может быть длиннее 100 символов";
  }
  const description = form.description.trim();
  if (description.length === 0) {
    errors.description = "Укажите описание";
  } else if (description.length > 500) {
    errors.description = "Описание не может быть длиннее 500 символов";
  }
  const duration = Number(form.durationMinutes.trim());
  if (form.durationMinutes.trim() === "") {
    errors.durationMinutes = "Укажите длительность";
  } else if (!Number.isInteger(duration) || duration < 5 || duration > 240) {
    errors.durationMinutes = "Длительность должна быть от 5 до 240 минут";
  }
  return errors;
}

// Панель владельца: управление типами встреч (issue #8). Достижима
// только прямым URL /admin, переходов с публичной страницы нет (ADR 0001).
export default function AdminPage() {
  const {
    status,
    data: types,
    setData: setTypes,
    reload: reloadTypes,
  } = useLoad<MeetingType[]>(loadPanelMeetingTypes, []);

  const {
    status: meetingsStatus,
    data: meetings,
    reload: reloadMeetings,
  } = useLoad<Meeting[]>(loadPanelMeetings, []);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MeetingType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const retry = () => {
    reloadTypes();
    reloadMeetings();
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: "create" });
  };

  const openEdit = (target: MeetingType) => {
    setForm({
      title: target.title,
      description: target.description,
      durationMinutes: String(target.durationMinutes),
    });
    setFormErrors({});
    setFormError(null);
    setEditor({ mode: "edit", target });
  };

  const closeEditor = () => {
    setEditor(null);
  };

  const openDelete = (target: MeetingType) => {
    setDeleteError(null);
    setDeleteTarget(target);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const submit = async () => {
    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const input: MeetingTypeInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      durationMinutes: Number(form.durationMinutes.trim()),
    };
    if (!editor) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editor.mode === "create") {
        const created = await createPanelMeetingType(input);
        setTypes((current) => [created, ...current]);
      } else {
        const updated = await updatePanelMeetingType(editor.target.id, input);
        setTypes((current) =>
          current.map((type) => (type.id === updated.id ? updated : type)),
        );
      }
      setEditor(null);
    } catch (error) {
      setFormError(
        error instanceof PanelApiError
          ? error.message
          : "Не удалось сохранить тип встречи",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePanelMeetingType(deleteTarget.id);
      setTypes((current) =>
        current.filter((type) => type.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error instanceof PanelApiError
          ? error.message
          : "Не удалось удалить тип встречи",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Container size="sm" py="xl">
      <Title order={1} mb="xl">
        Панель владельца
      </Title>

      <Group justify="space-between" mb="md">
        <Title order={2}>Типы встреч</Title>
        <Button onClick={openCreate}>Создать тип</Button>
      </Group>

      {status === "loading" && (
        <Stack gap="md">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} height={96} radius="md" />
          ))}
        </Stack>
      )}
      {status === "error" && (
        <Stack align="center" gap="sm">
          <Text c="red">Не удалось загрузить типы встреч</Text>
          <Button variant="light" onClick={retry}>
            Повторить
          </Button>
        </Stack>
      )}
      {status === "ready" && types.length === 0 && (
        <Text c="dimmed" ta="center">
          Пока нет типов встреч
        </Text>
      )}
      {status === "ready" && types.length > 0 && (
        <Stack
          component="ul"
          gap="md"
          style={{ listStyle: "none" }}
          p={0}
          m={0}
        >
          {types.map((type) => (
            <Card
              key={type.id}
              component="li"
              withBorder
              padding="lg"
              radius="md"
            >
              <Stack gap="xs">
                <Text size="lg" fw={600}>
                  {type.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {type.description}
                </Text>
                <Text size="sm" c="dimmed">
                  {formatDuration(type.durationMinutes)}
                </Text>
                <Group gap="xs" mt="xs">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => openEdit(type)}
                  >
                    Изменить
                  </Button>
                  <Button
                    variant="light"
                    color="red"
                    size="xs"
                    onClick={() => openDelete(type)}
                  >
                    Удалить
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      <Title order={2} mt="xl" mb="md">
        Предстоящие встречи
      </Title>

      {meetingsStatus === "error" && (
        <Stack align="center" gap="sm">
          <Text c="red">Не удалось загрузить встречи</Text>
          <Button variant="light" onClick={retry}>
            Повторить
          </Button>
        </Stack>
      )}
      {meetingsStatus === "ready" && meetings.length === 0 && (
        <Text c="dimmed" ta="center">
          Пока нет встреч
        </Text>
      )}
      {meetingsStatus === "ready" && meetings.length > 0 && (
        <Stack
          component="ul"
          gap="md"
          style={{ listStyle: "none" }}
          p={0}
          m={0}
        >
          {meetings.map((meeting) => (
            <Card
              key={meeting.id}
              component="li"
              withBorder
              padding="lg"
              radius="md"
            >
              <Stack gap="xs">
                <Text size="lg" fw={600}>
                  {meeting.typeTitle}
                </Text>
                <Text size="sm">{meeting.guestName}</Text>
                {meeting.comment && (
                  <Text size="sm" c="dimmed">
                    {meeting.comment}
                  </Text>
                )}
                <Text size="sm" c="dimmed">
                  {formatMeetingDateTime(meeting.startsAt)}
                </Text>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      <Modal
        opened={editor !== null}
        onClose={closeEditor}
        title={
          editor?.mode === "edit"
            ? "Изменение типа встречи"
            : "Новый тип встречи"
        }
      >
        <Stack gap="sm">
          <TextInput
            label="Название"
            value={form.title}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, title: value }));
            }}
            error={formErrors.title}
          />
          <Textarea
            label="Описание"
            value={form.description}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, description: value }));
            }}
            error={formErrors.description}
          />
          <NumberInput
            label="Длительность (минуты)"
            value={form.durationMinutes}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                durationMinutes: String(value),
              }))
            }
            error={formErrors.durationMinutes}
            allowDecimal={false}
          />
          {formError && (
            <Text c="red" size="sm">
              {formError}
            </Text>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeEditor}>
              Отмена
            </Button>
            <Button onClick={submit} loading={saving}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={closeDelete}
        title="Удалить тип встречи?"
      >
        <Stack gap="sm">
          <Text>
            Тип встречи «{deleteTarget?.title}» будет удалён. Действие
            необратимо.
          </Text>
          {deleteError && (
            <Text c="red" size="sm">
              {deleteError}
            </Text>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeDelete}>
              Отмена
            </Button>
            <Button color="red" onClick={confirmDelete} loading={deleting}>
              Удалить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
