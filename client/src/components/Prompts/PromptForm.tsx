import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import React from 'react';
import debounce from 'lodash/debounce';
import { useRecoilValue } from 'recoil';
import { Menu, Rocket } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import { useParams, useOutletContext } from 'react-router-dom';
import { Button, Skeleton, useToastContext } from '@librechat/client';
import { SystemRoles, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TCreatePrompt, TPrompt, TPromptGroup } from 'librechat-data-provider';
import {
  useGetPrompts,
  useCreatePrompt,
  useGetPromptGroup,
  useUpdatePromptGroup,
  useMakePromptProduction,
} from '~/data-provider';
import { useAuthContext, usePromptGroupsNav, useHasAccess, useLocalize } from '~/hooks';
import CategorySelector from './Groups/CategorySelector';
import NoPromptGroup from './Groups/NoPromptGroup';
import PromptVariables from './PromptVariables';
import { cn, findPromptGroup } from '~/utils';
import PromptVersions from './PromptVersions';
import { PromptsEditorMode } from '~/common';
import DeleteVersion from './DeleteVersion';
import PromptDetails from './PromptDetails';
import PromptEditor from './PromptEditor';
import SkeletonForm from './SkeletonForm';
import Description from './Description';
import SharePrompt from './SharePrompt';
import PromptName from './PromptName';
import Command from './Command';
import store from '~/store';

interface RightPanelProps {
  group: TPromptGroup;
  prompts: TPrompt[];
  selectedPrompt: any;
  selectionIndex: number;
  selectedPromptId?: string;
  isLoadingPrompts: boolean;
  setSelectionIndex: React.Dispatch<React.SetStateAction<number>>;
}

const RightPanel = React.memo(
  ({
    group,
    prompts,
    selectedPrompt,
    selectedPromptId,
    isLoadingPrompts,
    selectionIndex,
    setSelectionIndex,
  }: RightPanelProps) => {
    const localize = useLocalize();
    const { showToast } = useToastContext();
    const editorMode = useRecoilValue(store.promptsEditorMode);
    const hasShareAccess = useHasAccess({
      permissionType: PermissionTypes.PROMPTS,
      permission: Permissions.SHARED_GLOBAL,
    });

    const updateGroupMutation = useUpdatePromptGroup({
      onError: () => {
        showToast({
          status: 'error',
          message: localize('com_ui_prompt_update_error'),
        });
      },
    });

    const makeProductionMutation = useMakePromptProduction();

    const groupId = group?._id || '';
    const groupName = group?.name || '';
    const groupCategory = group?.category || '';
    const isLoadingGroup = !group;

    return (
      <div
        className="h-full w-full overflow-y-auto bg-surface-primary px-4"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        <div className="mb-2 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-x-2 xl:flex-row xl:space-y-0">
          <CategorySelector
            currentCategory={groupCategory}
            onValueChange={(value) =>
              updateGroupMutation.mutate({
                id: groupId,
                payload: { name: groupName, category: value },
              })
            }
          />
          <div className="mt-2 flex flex-row items-center justify-center gap-x-2 lg:mt-0">
            {hasShareAccess && <SharePrompt group={group} disabled={isLoadingGroup} />}
            {editorMode === PromptsEditorMode.ADVANCED && (
              <Button
                variant="submit"
                size="sm"
                aria-label="Make prompt production"
                className="h-10 w-10 border border-transparent p-0.5 transition-all"
                onClick={() => {
                  if (!selectedPrompt) {
                    console.warn('No prompt is selected');
                    return;
                  }
                  const { _id: promptVersionId = '', prompt } = selectedPrompt;
                  makeProductionMutation.mutate({
                    id: promptVersionId,
                    groupId,
                    productionPrompt: { prompt },
                  });
                }}
                disabled={
                  isLoadingGroup ||
                  !selectedPrompt ||
                  selectedPrompt._id === group?.productionId ||
                  makeProductionMutation.isLoading
                }
              >
                <Rocket className="size-5 cursor-pointer text-white" />
              </Button>
            )}
            <DeleteVersion
              promptId={selectedPromptId}
              groupId={groupId}
              promptName={groupName}
              disabled={isLoadingGroup}
            />
          </div>
        </div>
        {editorMode === PromptsEditorMode.ADVANCED &&
          (isLoadingPrompts
            ? Array.from({ length: 6 }).map((_, index: number) => (
                <div key={index} className="my-2">
                  <Skeleton className="h-[72px] w-full" />
                </div>
              ))
            : prompts.length > 0 && (
                <PromptVersions
                  group={group}
                  prompts={prompts}
                  selectionIndex={selectionIndex}
                  setSelectionIndex={setSelectionIndex}
                />
              ))}
      </div>
    );
  },
);

RightPanel.displayName = 'RightPanel';

const PromptForm = () => {
  const params = useParams();
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const alwaysMakeProd = useRecoilValue(store.alwaysMakeProd);
  const promptId = params.promptId || '';

  const editorMode = useRecoilValue(store.promptsEditorMode);
  const [selectionIndex, setSelectionIndex] = useState<number>(0);

  const prevIsEditingRef = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const sidePanelWidth = '320px';

  // Fetch group early so it is available for later hooks.
  const { data: group, isLoading: isLoadingGroup } = useGetPromptGroup(promptId);
  const { data: prompts = [], isLoading: isLoadingPrompts } = useGetPrompts(
    { groupId: promptId },
    { enabled: !!promptId },
  );

  const isOwner = useMemo(() => (user && group ? user.id === group.author : false), [user, group]);

  const methods = useForm({
    defaultValues: {
      prompt: '',
      promptName: group ? group.name : '',
      category: group ? group.category : '',
    },
  });
  const { handleSubmit, setValue, reset, watch } = methods;
  const promptText = watch('prompt');

  const selectedPrompt = useMemo(
    () => (prompts.length > 0 ? prompts[selectionIndex] : undefined),
    [prompts, selectionIndex],
  );

  const selectedPromptId = useMemo(() => selectedPrompt?._id, [selectedPrompt?._id]);

  const { groupsQuery } = useOutletContext<ReturnType<typeof usePromptGroupsNav>>();

  const updateGroupMutation = useUpdatePromptGroup({
    onError: () => {
      showToast({
        status: 'error',
        message: localize('com_ui_prompt_update_error'),
      });
    },
  });

  const makeProductionMutation = useMakePromptProduction();

  const createPromptMutation = useCreatePrompt({
    onMutate: (variables) => {
      reset(
        {
          prompt: variables.prompt.prompt,
          category: variables.group ? variables.group.category : '',
        },
        { keepDirtyValues: true },
      );
    },
    onSuccess(data) {
      if (alwaysMakeProd && data.prompt._id != null && data.prompt._id && data.prompt.groupId) {
        makeProductionMutation.mutate({
          id: data.prompt._id,
          groupId: data.prompt.groupId,
          productionPrompt: { prompt: data.prompt.prompt },
        });
      }

      reset({
        prompt: data.prompt.prompt,
        promptName: data.group ? data.group.name : '',
        category: data.group ? data.group.category : '',
      });
    },
  });

  const onSave = useCallback(
    (value: string) => {
      if (!value) {
        // TODO: show toast, cannot be empty.
        return;
      }
      if (!selectedPrompt) {
        return;
      }
      const tempPrompt: TCreatePrompt = {
        prompt: {
          type: selectedPrompt.type ?? 'text',
          groupId: selectedPrompt.groupId ?? '',
          prompt: value,
        },
      };

      if (value === selectedPrompt.prompt) {
        return;
      }

      createPromptMutation.mutate(tempPrompt);
    },
    [selectedPrompt, createPromptMutation],
  );

  const handleLoadingComplete = useCallback(() => {
    if (isLoadingGroup || isLoadingPrompts) {
      return;
    }
    setInitialLoad(false);
  }, [isLoadingGroup, isLoadingPrompts]);

  useEffect(() => {
    if (prevIsEditingRef.current && !isEditing) {
      handleSubmit((data) => onSave(data.prompt))();
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, onSave, handleSubmit]);

  useEffect(() => {
    handleLoadingComplete();
  }, [params.promptId, editorMode, group?.productionId, prompts, handleLoadingComplete]);

  useEffect(() => {
    setValue('prompt', selectedPrompt ? selectedPrompt.prompt : '', { shouldDirty: false });
    setValue('category', group ? group.category : '', { shouldDirty: false });
  }, [selectedPrompt, group, setValue]);

  useEffect(() => {
    const handleResize = () => {
      if (window.matchMedia('(min-width: 1022px)').matches) {
        setShowSidePanel(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const debouncedUpdateOneliner = useMemo(
    () =>
      debounce((groupId: string, oneliner: string, mutate: any) => {
        mutate({ id: groupId, payload: { oneliner } });
      }, 950),
    [],
  );

  const debouncedUpdateCommand = useMemo(
    () =>
      debounce((groupId: string, command: string, mutate: any) => {
        mutate({ id: groupId, payload: { command } });
      }, 950),
    [],
  );

  const handleUpdateOneliner = useCallback(
    (oneliner: string) => {
      if (!group || !group._id) {
        return console.warn('Group not found');
      }
      debouncedUpdateOneliner(group._id, oneliner, updateGroupMutation.mutate);
    },
    [group, updateGroupMutation.mutate, debouncedUpdateOneliner],
  );

  const handleUpdateCommand = useCallback(
    (command: string) => {
      if (!group || !group._id) {
        return console.warn('Group not found');
      }
      debouncedUpdateCommand(group._id, command, updateGroupMutation.mutate);
    },
    [group, updateGroupMutation.mutate, debouncedUpdateCommand],
  );

  if (initialLoad) {
    return <SkeletonForm />;
  }

  if (!isOwner && groupsQuery.data && user?.role !== SystemRoles.ADMIN) {
    const fetchedPrompt = findPromptGroup(
      groupsQuery.data,
      (group) => group._id === params.promptId,
    );
    if (!fetchedPrompt) {
      return <NoPromptGroup />;
    }

    return <PromptDetails group={fetchedPrompt} />;
  }

  if (!group || group._id == null) {
    return null;
  }

  const groupName = group.name;

  return (
    <FormProvider {...methods}>
      <form className="mt-4 flex w-full" onSubmit={handleSubmit((data) => onSave(data.prompt))}>
        <div className="relative w-full">
          <div
            className="h-full w-full"
            style={{
              transform: `translateX(${showSidePanel ? `-${sidePanelWidth}` : '0'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            <div className="flex h-full">
              <div className="flex-1 overflow-hidden px-4">
                <div className="mb-4 flex items-center gap-2 text-text-primary">
                  {isLoadingGroup ? (
                    <Skeleton className="mb-1 flex h-10 w-32 font-bold sm:text-xl md:mb-0 md:h-12 md:text-2xl" />
                  ) : (
                    <>
                      <PromptName
                        name={groupName}
                        onSave={(value) => {
                          if (!group._id) {
                            return;
                          }
                          updateGroupMutation.mutate({ id: group._id, payload: { name: value } });
                        }}
                      />
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-10 border border-border-light p-0 lg:hidden"
                        onClick={() => setShowSidePanel(true)}
                        aria-label={localize('com_endpoint_open_menu')}
                      >
                        <Menu className="size-5" />
                      </Button>
                      <div className="hidden lg:block">
                        {editorMode === PromptsEditorMode.SIMPLE && (
                          <RightPanel
                            group={group}
                            prompts={prompts}
                            selectedPrompt={selectedPrompt}
                            selectionIndex={selectionIndex}
                            selectedPromptId={selectedPromptId}
                            isLoadingPrompts={isLoadingPrompts}
                            setSelectionIndex={setSelectionIndex}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isLoadingPrompts ? (
                  <Skeleton className="h-96" aria-live="polite" />
                ) : (
                  <div className="mb-2 flex h-full flex-col gap-4">
                    <PromptEditor name="prompt" isEditing={isEditing} setIsEditing={setIsEditing} />
                    <PromptVariables promptText={promptText} />
                    <Description
                      initialValue={group.oneliner ?? ''}
                      onValueChange={handleUpdateOneliner}
                    />
                    <Command
                      initialValue={group.command ?? ''}
                      onValueChange={handleUpdateCommand}
                    />
                  </div>
                )}
              </div>

              {editorMode === PromptsEditorMode.ADVANCED && (
                <div className="hidden w-1/4 border-l border-border-light lg:block">
                  <RightPanel
                    group={group}
                    prompts={prompts}
                    selectionIndex={selectionIndex}
                    selectedPrompt={selectedPrompt}
                    selectedPromptId={selectedPromptId}
                    isLoadingPrompts={isLoadingPrompts}
                    setSelectionIndex={setSelectionIndex}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className={cn(
              'absolute inset-0 z-40 cursor-default',
              showSidePanel ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ transition: 'opacity 0.3s ease-in-out' }}
            onClick={() => setShowSidePanel(false)}
            aria-hidden={!showSidePanel}
            tabIndex={showSidePanel ? 0 : -1}
            aria-label={localize('com_ui_close_menu')}
          />
          <div
            className="absolute inset-y-0 right-0 z-50 lg:hidden"
            style={{
              width: sidePanelWidth,
              transform: `translateX(${showSidePanel ? '0' : '100%'})`,
              transition: 'transform 0.3s ease-in-out',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation panel"
          >
            <div className="h-full">
              <div className="h-full overflow-auto">
                <RightPanel
                  group={group}
                  prompts={prompts}
                  selectionIndex={selectionIndex}
                  selectedPrompt={selectedPrompt}
                  selectedPromptId={selectedPromptId}
                  isLoadingPrompts={isLoadingPrompts}
                  setSelectionIndex={setSelectionIndex}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};

export default PromptForm;
