from django.contrib import admin
from .models import Category, Grievance, AIAnalysis, Response, StatusHistory, Attachment

class AIAnalysisInline(admin.StackedInline):
    model = AIAnalysis
    extra = 0
    can_delete = False

class ResponseInline(admin.TabularInline):
    model = Response
    extra = 0
    readonly_fields = ('created_at',)

class StatusHistoryInline(admin.TabularInline):
    model = StatusHistory
    extra = 0
    readonly_fields = ('previous_status', 'new_status', 'action_by', 'remarks', 'created_at')
    can_delete = False

class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0
    readonly_fields = ('uploaded_at',)

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'description')
    search_fields = ('name',)

@admin.register(Grievance)
class GrievanceAdmin(admin.ModelAdmin):
    list_display = ('id_formatted', 'title', 'user', 'department', 'category', 'current_status', 'is_anonymous', 'created_at')
    list_filter = ('current_status', 'is_anonymous', 'category', 'department', 'created_at')
    search_fields = ('id', 'title', 'description', 'secret_code', 'user__username', 'user__email')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [AIAnalysisInline, AttachmentInline, ResponseInline, StatusHistoryInline]

    def id_formatted(self, obj):
        return f"GMS-{obj.id:04d}"
    id_formatted.short_description = "Grievance ID"

@admin.register(AIAnalysis)
class AIAnalysisAdmin(admin.ModelAdmin):
    list_display = ('grievance', 'spam_prediction', 'confidence_score', 'analysis_timestamp')
    list_filter = ('spam_prediction', 'analysis_timestamp')
    search_fields = ('grievance__title', 'classification_reason')

@admin.register(Response)
class ResponseAdmin(admin.ModelAdmin):
    list_display = ('grievance', 'responder', 'created_at')
    list_filter = ('created_at', 'responder')
    search_fields = ('grievance__title', 'content', 'responder__username')

@admin.register(StatusHistory)
class StatusHistoryAdmin(admin.ModelAdmin):
    list_display = ('grievance', 'previous_status', 'new_status', 'action_by', 'created_at')
    list_filter = ('previous_status', 'new_status', 'created_at')
    search_fields = ('grievance__title', 'remarks')

@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ('file_name', 'grievance', 'file_type', 'uploaded_at')
    list_filter = ('uploaded_at', 'file_type')
    search_fields = ('file_name', 'grievance__title')
